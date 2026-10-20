//! Persisted database grants and short-lived gateway authority.
mod agent_contracts;
mod binding;
mod contracts;
mod management;
mod routes;
mod service;
pub use agent_contracts::*;
pub use binding::*;
pub use contracts::*;
pub use management::{ManagedCommand, ManagementConfig};
pub use routes::*;
pub use service::*;
#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct Error {
    pub status: u16,
    pub message: &'static str,
}
pub type Result<T> = std::result::Result<T, Error>;
fn invalid() -> Error {
    Error {
        status: 400,
        message: "Invalid database request.",
    }
}
fn denied() -> Error {
    Error {
        status: 404,
        message: "Database access is unavailable.",
    }
}
fn unavailable() -> Error {
    Error {
        status: 503,
        message: "Database service is unavailable.",
    }
}
impl From<sea_orm::DbErr> for Error {
    fn from(_: sea_orm::DbErr) -> Self {
        unavailable()
    }
}

fn conflict(message: &'static str) -> Error {
    Error {
        status: 409,
        message,
    }
}

/// Native callback purpose is chosen by the fixed authenticated RPC method, never caller JSON.
#[derive(Clone, Copy, Debug)]
pub enum DatabaseCallback {
    Guard,
    Checkpoint(DatabaseCheckpointPhase),
    Completion(DatabaseCompletionOutcome),
}
