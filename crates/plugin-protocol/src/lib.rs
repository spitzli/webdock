//! Versioned, provider-neutral plugin contracts. No database or provider credentials.
mod invocation;
mod manifest;
mod policy;
pub use invocation::{InvocationClaims, verify_invocation};
pub use manifest::{Manifest, validate_value};
pub use policy::{ActionPolicy, Availability};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidInput,
    NotSupported,
    PermissionDenied,
    CapabilityUnavailable,
    Conflict,
    Unavailable,
    DeadlineExceeded,
    NotFound,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginError {
    pub code: ErrorCode,
    pub message: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}
impl PluginError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retryable: false,
            request_id: None,
        }
    }
    pub fn denied() -> Self {
        Self::new(ErrorCode::PermissionDenied, "Plugin invocation denied")
    }
}
impl std::fmt::Display for PluginError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for PluginError {}
pub type Result<T> = std::result::Result<T, PluginError>;
pub const MANIFEST_BYTES: usize = 256 * 1024;
pub const FRAME_BYTES: usize = 32 * 1024;
pub const DOCUMENT_BYTES: usize = 64 * 1024;
pub const CAPABILITIES: &[&str] = &[
    "plugin.apps.read",
    "plugin.apps.manage",
    "plugin.apps.provision",
    "project.read",
    "plugin.data.read",
    "plugin.data.write",
    "plugin.db.read",
    "plugin.db.write",
    "plugin.cache.read",
    "plugin.cache.write",
    "plugin.jobs.read",
    "plugin.jobs.enqueue",
    "plugin.jobs.cancel",
    "plugin.events.emit",
    "plugin.events.subscribe",
    "plugin.storage.read",
    "plugin.storage.write",
    "plugin.secrets.read",
    "plugin.http.read",
    "plugin.http.request",
    "plugin.audit.emit",
    "plugin.workloads",
];
/// Kubernetes kinds (`apiVersion/Kind`) a plugin may declare for its workloads. Everything is
/// namespaced; Core pins the namespace and owner labels, and the agent checks the same list.
pub const WORKLOAD_KINDS: &[&str] = &[
    "apps/v1/Deployment",
    "apps/v1/StatefulSet",
    "v1/Service",
    "v1/Secret",
    "v1/ConfigMap",
    "v1/PersistentVolumeClaim",
    "networking.k8s.io/v1/NetworkPolicy",
    "networking.k8s.io/v1/Ingress",
    "traefik.io/v1alpha1/IngressRoute",
    "traefik.io/v1alpha1/Middleware",
    "traefik.io/v1alpha1/IngressRouteTCP",
    "cert-manager.io/v1/Certificate",
    "postgresql.cnpg.io/v1/Cluster",
    "postgresql.cnpg.io/v1/Pooler",
];
pub const READ_CAPABILITIES: &[&str] = &[
    "plugin.apps.read",
    "plugin.http.read",
    "project.read",
    "plugin.data.read",
    "plugin.db.read",
    "plugin.cache.read",
    "plugin.storage.read",
    "plugin.jobs.read",
    "plugin.secrets.read",
];
