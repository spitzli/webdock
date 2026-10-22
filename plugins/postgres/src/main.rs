//! PostgreSQL plugin runtime over private Unix sockets, with its own storage database.
use serde::Deserialize;
use std::{path::PathBuf, process::ExitCode, sync::Arc};
use webdock_plugin_runtime::{self as runtime, HostClient};
type Error = Box<dyn std::error::Error + Send + Sync>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Configuration {
    manifest: PathBuf,
    issuer_public_key_hex: String,
    generation: u64,
    listen: PathBuf,
    core: PathBuf,
    core_peers: Vec<runtime::CorePeer>,
    storage_url: String,
    secret_key_hex: String,
    shared_servers: Vec<webdock_postgres::shared::SharedServer>,
    dedicated: Option<webdock_postgres::dedicated::DedicatedConfig>,
}
async fn run() -> Result<(), Error> {
    let mut args = std::env::args_os().skip(1);
    let path = PathBuf::from(args.next().ok_or("configuration path required")?);
    if args.next().is_some() {
        return Err("unexpected argument".into());
    }
    let config: Configuration =
        serde_json::from_slice(&webdock_plugin_kit::read_file(&path, true)?)?;
    let manifest = webdock_plugin_protocol::Manifest::parse(&webdock_plugin_kit::read_file(
        &config.manifest,
        false,
    )?)?;
    webdock_postgres::validate_manifest(&manifest)?;
    webdock_plugin_kit::loopback(&config.storage_url)?;
    for server in &config.shared_servers {
        webdock_plugin_kit::loopback(&server.admin_url)?;
    }
    let store = webdock_postgres::store::Store::connect(&config.storage_url).await?;
    for server in &config.shared_servers {
        server.harden().await?;
    }
    let placement = config
        .dedicated
        .as_ref()
        .map(webdock_postgres::dedicated::Placement::new)
        .transpose()?;
    let plugin = webdock_postgres::Plugin::new(
        store,
        webdock_postgres::seal::Sealer::new(&config.secret_key_hex)?,
        config.shared_servers,
        placement,
    );
    plugin.resume().await?;
    let key: [u8; 32] = hex::decode(config.issuer_public_key_hex)?
        .try_into()
        .map_err(|_| "invalid key")?;
    let client = HostClient::connect_unix(config.core).await?;
    let authority = runtime::RemoteAuthority::new(
        client,
        manifest.id().into(),
        config.generation,
        config.core_peers,
    )?;
    let runtime = runtime::Runtime::new(
        manifest,
        config.generation,
        ed25519_dalek::VerifyingKey::from_bytes(&key)?,
        Arc::new(authority),
        Arc::new(webdock_postgres::Handler(plugin)),
    )?;
    let shutdown = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    runtime
        .serve_unix(runtime::UnixSocket::bind(config.listen)?, shutdown)
        .await?;
    Ok(())
}
#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("postgres_plugin_start_failed: {error}");
            ExitCode::FAILURE
        }
    }
}
