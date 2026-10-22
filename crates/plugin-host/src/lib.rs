//! Persisted plugin admission and host services on retained signed RLS policies.
mod authority;
mod bindings;
pub mod data;
mod entities;
pub mod http;
mod scope;
mod session_authority;
pub use authority::limits::{CustomerPlanInput, PlanInput};
pub use authority::workloads;
pub use authority::{
    AdmissionInput, AdmittedInvocation, AppsAdapter, HostService, InvocationHandle,
    InvocationScope, MailPolicySnapshot, OperationSnapshot, OperationStatus, PluginView,
    RepositoryPolicySnapshot, RuntimeAuthority, RuntimeDescription, StateLease, StateProbe,
};
pub use bindings::{FileBindings, PeerEnrollment, RuntimeBinding, RuntimeBindings};
use webdock_plugin_protocol::{ErrorCode, PluginError};
fn unavailable() -> PluginError {
    PluginError::new(ErrorCode::Unavailable, "Plugin host unavailable")
}
fn db_error(_: sea_orm::DbErr) -> PluginError {
    unavailable()
}
fn invalid(message: &str) -> PluginError {
    PluginError::new(ErrorCode::InvalidInput, message)
}
fn conflict(message: &str) -> PluginError {
    PluginError::new(ErrorCode::Conflict, message)
}
fn unsupported(message: &str) -> PluginError {
    PluginError::new(ErrorCode::CapabilityUnavailable, message)
}
fn slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

mod rpc;
pub use rpc::HostRpc;
