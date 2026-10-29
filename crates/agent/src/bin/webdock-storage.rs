use clap::{Parser, Subcommand};
use std::path::PathBuf;
use webdock_agent::storage::{StorageKind, StoragePool, serve_kind_with_recovery};
#[derive(Parser)]
#[command(about = "Separately privileged Webdock fixed filesystem helper")]
struct Arguments {
    #[arg(long)]
    config: PathBuf,
    /// Serve a separate PostgreSQL installation pool (UID/GID 26).
    #[arg(long)]
    database: bool,
    /// Root-installed public signer/profile trust for isolated recovery, disabled by default.
    #[arg(long)]
    recovery_trust: Option<PathBuf>,
    #[command(subcommand)]
    action: Action,
}
#[derive(Subcommand)]
enum Action {
    Initialize,
    Restore,
    Serve {
        #[arg(long)]
        socket: PathBuf,
    },
}
#[tokio::main]
async fn main() -> std::process::ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .init();
    let arguments = Arguments::parse();
    let kind = if arguments.database {
        StorageKind::Database
    } else {
        StorageKind::Apps
    };
    let result = match arguments.action {
        Action::Initialize => StoragePool::initialize(&arguments.config)
            .and_then(|()| StoragePool::open_kind(&arguments.config, kind).map(|_| ())),
        Action::Restore => {
            StoragePool::open_kind(&arguments.config, kind).and_then(|pool| pool.restore())
        }
        Action::Serve { socket } => {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("signal handler");
            serve_kind_with_recovery(
                &arguments.config,
                &socket,
                kind,
                arguments.recovery_trust.as_deref(),
                async {
                    tokio::select! {_=tokio::signal::ctrl_c()=>{},_=terminate.recv()=>{}}
                },
            )
            .await
        }
    };
    match result {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            std::process::ExitCode::FAILURE
        }
    }
}
