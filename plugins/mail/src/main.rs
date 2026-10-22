//! Mail plugin runtime over private Unix sockets, with its own storage database.
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
    platform_transport: webdock_mail::transport::Platform,
    #[serde(default)]
    trust_unverified_domains: bool,
    mailboxes: Option<webdock_mail::engine::EngineConfig>,
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
    webdock_mail::validate_manifest(&manifest)?;
    webdock_plugin_kit::loopback(&config.storage_url)?;
    config.platform_transport.validate()?;
    if config.trust_unverified_domains
        && !matches!(
            config.platform_transport,
            webdock_mail::transport::Platform::Smtp { .. }
        )
    {
        return Err("unverified domains are trusted only with a loopback catcher".into());
    }
    let client = HostClient::connect_unix(config.core).await?;
    let engines = match config.mailboxes {
        Some(mailboxes) => Some(webdock_mail::engine::Engines::new(
            Box::new(webdock_mail::engine::HostWorkloads {
                client: client.clone(),
                plugin: manifest.id().into(),
                generation: config.generation,
            }),
            mailboxes,
        )?),
        None => None,
    };
    let plugin = webdock_mail::Plugin::new(
        webdock_mail::store::Store::connect(&config.storage_url).await?,
        webdock_mail::seal::Sealer::new(&config.secret_key_hex)?,
        webdock_mail::transport::Sender::new(webdock_mail::transport::TURBOSMTP_ORIGIN),
        Box::new(webdock_mail::SystemDns::new()?),
        webdock_mail::Settings {
            platform: config.platform_transport,
            trust_unverified_domains: config.trust_unverified_domains,
        },
        engines,
    );
    plugin.resume().await?;
    let key: [u8; 32] = hex::decode(config.issuer_public_key_hex)?
        .try_into()
        .map_err(|_| "invalid key")?;
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
        Arc::new(webdock_mail::Handler(plugin)),
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
            eprintln!("mail_plugin_start_failed: {error}");
            ExitCode::FAILURE
        }
    }
}
