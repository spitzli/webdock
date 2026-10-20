//! Reconciles persisted availability commands for explicitly installed runtimes.
use clap::Parser;
use std::{path::PathBuf, process::ExitCode, sync::Arc, time::Duration};
use webdock_control_plane::{
    plugin_config::{PluginConfig, authority_services},
    plugins::{PluginDependencies, PluginEndpoints},
};
#[derive(Parser)]
struct Args {
    #[arg(long)]
    config: PathBuf,
    #[arg(long)]
    once: bool,
}
type Error = Box<dyn std::error::Error + Send + Sync>;
fn required(key: &str) -> Result<String, Error> {
    std::env::var(key).map_err(|_| format!("Missing {key}").into())
}
async fn run() -> Result<(), Error> {
    let args = Args::parse();
    let config = PluginConfig::load(&args.config)?;
    let platform = webdock_core::config::PlatformConfig::from_map(&std::env::vars().collect())?;
    let auth_url = required("WEBDOCK_DATABASE_URL")?;
    let auth = webdock_control_plane::db::connect_runtime(
        &auth_url,
        "webdock_auth_bootstrap",
        platform.production,
    )
    .await?;
    let business = webdock_control_plane::db::connect_runtime(
        &required("WEBDOCK_SESSION_DATABASE_URL")?,
        "webdock_auth_runtime",
        platform.production,
    )
    .await?;
    let worker = webdock_control_plane::db::connect_runtime(
        &required("WEBDOCK_WORKER_DATABASE_URL")?,
        "webdock_worker_runtime",
        platform.production,
    )
    .await?;
    let ids = Arc::new(
        webdock_persistence::IdAllocator::connect(
            &auth_url,
            webdock_ids::Identity::platform(0, 2)?,
        )
        .await?,
    );
    let authority = authority_services(auth.clone(), ids.clone(), &platform).await?;
    let endpoints = PluginEndpoints::initialize(
        PluginDependencies {
            business,
            worker,
            auth,
            identity: authority.identity,
            browser: authority.browser,
            oauth: authority.oauth,
            ids,
            rls_secret: required("DATABASE_RLS_SECRET")?,
        },
        &config,
    )
    .await?;
    loop {
        if let Some(lease) = endpoints.host.claim_state_operation(None).await? {
            endpoints
                .host
                .advance_state_operation(&lease, &endpoints)
                .await?;
        }
        if args.once {
            return Ok(());
        }
        tokio::select! {
            result = tokio::signal::ctrl_c() => { result?; return Ok(()); },
            _ = tokio::time::sleep(Duration::from_millis(500)) => {},
        }
    }
}
#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => {
            eprintln!("plugin_controller_failed");
            ExitCode::FAILURE
        }
    }
}
