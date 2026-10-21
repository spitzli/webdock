//! Native plugin browser adapters; discovery metadata never grants execution authority.
use crate::{
    auth,
    http::{ApiFailure, ServiceState, reject},
    plugin_config::RuntimeConnections,
};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{RawQuery, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use webdock_plugin_host::{AdmissionInput, HostService};
use webdock_plugin_protocol::{ErrorCode, Manifest, PluginError};
pub struct PluginEndpoints {
    pub host: Arc<HostService>,
    pub connections: RuntimeConnections,
    pub repository: Option<Arc<webdock_build::RepositoryAdmission>>,
    pub mcp_client: Option<crate::plugin_config::McpClientConfig>,
}
impl PluginEndpoints {
    pub fn new(
        host: Arc<HostService>,
        connections: RuntimeConnections,
        repository: Option<Arc<webdock_build::RepositoryAdmission>>,
    ) -> Self {
        Self {
            host,
            connections,
            repository,
            mcp_client: None,
        }
    }
    pub async fn invoke(
        &self,
        actor: &auth::AuthenticatedActor,
        input: AdmissionInput,
    ) -> Result<Value, PluginError> {
        let view = self
            .host
            .project_plugins_with_authority(&actor.principal, &input.project_id, &actor.authority)
            .await?
            .into_iter()
            .find(|v| v.manifest["name"] == input.plugin_id)
            .ok_or_else(|| PluginError::new(ErrorCode::NotFound, "Plugin is unavailable"))?;
        let connection = self
            .connections
            .load(&input.plugin_id)
            .map_err(|_| unavailable_plugin())?;
        if connection.generation != view.generation {
            return Err(PluginError::denied());
        }
        let plugin = input.plugin_id.clone();
        let admitted = self
            .host
            .admit_with_authority(
                &actor.principal,
                input,
                !actor.read_only(),
                &actor.authority,
            )
            .await?;
        self.invoke_admitted(plugin, view, connection, admitted)
            .await
    }
    pub async fn invoke_mcp(
        &self,
        actor: &webdock_oauth::McpAuthentication,
        input: AdmissionInput,
    ) -> Result<Value, PluginError> {
        let view = self
            .host
            .project_plugins_with_mcp(&actor.principal, &input.project_id, &actor.authority)
            .await?
            .into_iter()
            .find(|v| v.manifest["name"] == input.plugin_id)
            .ok_or_else(PluginError::denied)?;
        let plugin = input.plugin_id.clone();
        let connection = self
            .connections
            .load(&plugin)
            .map_err(|_| unavailable_plugin())?;
        if connection.generation != view.generation {
            return Err(PluginError::denied());
        }
        let admitted = self
            .host
            .admit_with_mcp_authority(
                &actor.principal,
                input,
                actor.authority.can_write(),
                &actor.authority,
            )
            .await?;
        self.invoke_admitted(plugin, view, connection, admitted)
            .await
    }
    async fn invoke_admitted(
        &self,
        plugin: String,
        view: webdock_plugin_host::PluginView,
        connection: crate::plugin_config::RuntimeConnection,
        admitted: webdock_plugin_host::AdmittedInvocation,
    ) -> Result<Value, PluginError> {
        let result = async {
            let payload = serde_json::to_vec(&admitted.input).map_err(|_| PluginError::denied())?;
            let (mut client, peer) = connection
                .connect_authenticated()
                .await
                .map_err(|_| unavailable_plugin())?;
            let handle = self.host.authenticate(peer, &admitted.token).await?;
            let health = client
                .health(webdock_plugin_runtime::wire::HealthRequest {})
                .await
                .map_err(|_| unavailable_plugin())?
                .into_inner();
            if health.plugin_id != plugin
                || health.version != view.manifest["version"].as_str().unwrap_or("")
                || health.generation != admitted.claims.generation
                || health.protocol_version != 1
            {
                return Err(PluginError::denied());
            }
            let described = client
                .describe(webdock_plugin_runtime::wire::DescribeRequest {})
                .await
                .map_err(|_| unavailable_plugin())?
                .into_inner();
            if hex::encode(Sha256::digest(&described.manifest_json)) != view.manifest_sha256 {
                return Err(PluginError::denied());
            }
            let manifest = Manifest::parse(&described.manifest_json)?;
            let reply = client
                .invoke(webdock_plugin_runtime::wire::InvokeRequest {
                    invocation_token: admitted.token.clone(),
                    action: admitted.claims.action.clone(),
                    input_json: payload,
                    configuration_json: serde_json::to_vec(&admitted.configuration)
                        .map_err(|_| unavailable_plugin())?,
                })
                .await
                .map_err(|status| match status.code() {
                    tonic::Code::PermissionDenied | tonic::Code::Unauthenticated => {
                        PluginError::denied()
                    }
                    tonic::Code::InvalidArgument => {
                        PluginError::new(ErrorCode::InvalidInput, "Plugin request is invalid")
                    }
                    tonic::Code::Aborted => {
                        PluginError::new(ErrorCode::Conflict, "Plugin operation conflict")
                    }
                    tonic::Code::Unimplemented => PluginError::new(
                        ErrorCode::CapabilityUnavailable,
                        "Plugin capability unavailable",
                    ),
                    _ => unavailable_plugin(),
                })?
                .into_inner();
            if reply.output_json.len() > 65536 {
                return Err(unavailable_plugin());
            }
            let result =
                serde_json::from_slice(&reply.output_json).map_err(|_| unavailable_plugin())?;
            webdock_plugin_protocol::validate_value(
                manifest
                    .action(&admitted.claims.action)
                    .and_then(|a| a.get("output")),
                &result,
            )?;
            if self
                .connections
                .load(&plugin)
                .map_err(|_| unavailable_plugin())?
                != connection
            {
                return Err(PluginError::denied());
            }
            self.host.revalidate(&handle).await?;
            // Create/delete actions update the Core resource index before the token is revoked.
            if manifest
                .action(&admitted.claims.action)
                .is_some_and(|a| a.get("resource").is_some_and(|r| r != "use"))
            {
                self.host.record_resource(&handle, &result).await?;
            }
            Ok(result)
        }
        .await;
        self.host.revoke_issued(&admitted.token).await?;
        result
    }
}
fn unavailable_plugin() -> PluginError {
    PluginError::new(ErrorCode::Unavailable, "Plugin runtime is unavailable")
}
fn failure(error: PluginError) -> ApiFailure {
    let status = match error.code {
        ErrorCode::PermissionDenied => StatusCode::FORBIDDEN,
        ErrorCode::InvalidInput => StatusCode::BAD_REQUEST,
        ErrorCode::NotFound => StatusCode::NOT_FOUND,
        ErrorCode::Conflict => StatusCode::CONFLICT,
        _ => StatusCode::SERVICE_UNAVAILABLE,
    };
    let code = serde_json::to_value(error.code)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_else(|| "unavailable".into());
    reject(status, &code, &error.message)
}
fn endpoints(state: &ServiceState) -> Result<&Arc<PluginEndpoints>, ApiFailure> {
    state
        .plugins
        .as_ref()
        .ok_or_else(|| failure(unavailable_plugin()))
}
async fn actor(
    state: &ServiceState,
    headers: &HeaderMap,
) -> Result<auth::AuthenticatedActor, ApiFailure> {
    auth::resolve_actor(state, headers).await?.ok_or_else(|| {
        reject(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Sign in to continue.",
        )
    })
}
fn json_body(body: &[u8], headers: &HeaderMap) -> Result<Value, ApiFailure> {
    if body.len() > 65536 {
        return Err(reject(
            StatusCode::PAYLOAD_TOO_LARGE,
            "invalid_input",
            "Plugin request exceeds limit.",
        ));
    }
    if headers.get_all(header::CONTENT_TYPE).iter().count() != 1
        || headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(';').next())
            .map(str::trim)
            != Some("application/json")
    {
        return Err(reject(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "invalid_input",
            "JSON is required.",
        ));
    }
    serde_json::from_slice(body).map_err(|_| {
        reject(
            StatusCode::BAD_REQUEST,
            "invalid_input",
            "Invalid plugin request.",
        )
    })
}
pub fn routes() -> Router<Arc<ServiceState>> {
    Router::new()
        .merge(exposure::routes())
        .merge(operations::routes())
        .route("/api/console/plugins", get(list))
        .route("/api/console/plugins/invoke", post(invoke))
        .route("/api/console/plugins/installed", get(installed).post(admin))
}
async fn list(
    State(state): State<Arc<ServiceState>>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
) -> Response {
    let result: Result<Response, ApiFailure> = async {
        let actor = actor(&state, &headers).await?;
        let parameters = url::form_urlencoded::parse(query.as_deref().unwrap_or("").as_bytes())
            .collect::<Vec<_>>();
        if parameters.len() != 1 || parameters[0].0 != "projectID" {
            return Err(reject(
                StatusCode::BAD_REQUEST,
                "invalid_input",
                "A project is required.",
            ));
        }
        let service = endpoints(&state)?;
        let views = service
            .host
            .project_plugins_with_authority(&actor.principal, &parameters[0].1, &actor.authority)
            .await
            .map_err(failure)?;
        let mut output = Vec::new();
        for view in views {
            let plugin = view.manifest["name"]
                .as_str()
                .ok_or_else(|| failure(unavailable_plugin()))?;
            let mut value =
                serde_json::to_value(&view).map_err(|_| failure(unavailable_plugin()))?;
            if let Ok(binding) = service.connections.load(plugin)
                && binding.generation == view.generation
            {
                value["uiOrigin"] = json!(binding.ui_origin);
            }
            output.push(value);
        }
        Ok(Json(output).into_response())
    }
    .await;
    result.unwrap_or_else(IntoResponse::into_response)
}
async fn invoke(
    State(state): State<Arc<ServiceState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let result: Result<Response, ApiFailure> = async {
        let actor = actor(&state, &headers).await?;
        let input: AdmissionInput =
            serde_json::from_value(json_body(&body, &headers)?).map_err(|_| {
                reject(
                    StatusCode::BAD_REQUEST,
                    "invalid_input",
                    "Invalid plugin command.",
                )
            })?;
        Ok(Json(
            endpoints(&state)?
                .invoke(&actor, input)
                .await
                .map_err(failure)?,
        )
        .into_response())
    }
    .await;
    result.unwrap_or_else(IntoResponse::into_response)
}
async fn installed(State(state): State<Arc<ServiceState>>, headers: HeaderMap) -> Response {
    let result: Result<Response, ApiFailure> = async {
        let actor = actor(&state, &headers).await?;
        Ok(Json(
            endpoints(&state)?
                .host
                .installed_with_authority(&actor.principal, &actor.authority)
                .await
                .map_err(failure)?,
        )
        .into_response())
    }
    .await;
    result.unwrap_or_else(IntoResponse::into_response)
}
#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum AdminCommand {
    State {
        #[serde(rename = "pluginID")]
        plugin: String,
        desired: String,
        expected_revision: String,
        idempotency_key: String,
    },
}
async fn admin(
    State(state): State<Arc<ServiceState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let result: Result<Response, ApiFailure> = async {
        let actor = actor(&state, &headers).await?;
        if actor.read_only() {
            return Err(reject(
                StatusCode::FORBIDDEN,
                "permission_denied",
                "Write authority is required.",
            ));
        }
        let command: AdminCommand =
            serde_json::from_value(json_body(&body, &headers)?).map_err(|_| {
                reject(
                    StatusCode::BAD_REQUEST,
                    "invalid_input",
                    "Invalid plugin state command.",
                )
            })?;
        let host = &endpoints(&state)?.host;
        let value = match command {
            AdminCommand::State {
                plugin,
                desired,
                expected_revision,
                idempotency_key,
            } => {
                host.request_state_with_authority(
                    &actor.principal,
                    &actor.authority,
                    &plugin,
                    &desired,
                    &expected_revision,
                    &idempotency_key,
                )
                .await
            }
        }
        .map_err(failure)?;
        Ok(Json(value).into_response())
    }
    .await;
    result.unwrap_or_else(IntoResponse::into_response)
}

pub struct PluginDependencies {
    pub business: sea_orm::DatabaseConnection,
    pub worker: sea_orm::DatabaseConnection,
    pub auth: sea_orm::DatabaseConnection,
    pub identity: Arc<webdock_identity::IdentityService>,
    pub browser: Option<Arc<webdock_browser_session::BrowserSessions>>,
    pub oauth: Arc<webdock_oauth::OAuthService>,
    pub ids: Arc<webdock_persistence::IdAllocator>,
    pub rls_secret: String,
}
impl PluginEndpoints {
    pub async fn initialize(
        dependencies: PluginDependencies,
        config: &crate::plugin_config::PluginConfig,
    ) -> Result<Self, crate::plugin_config::ConfigurationError> {
        let host = Arc::new(
            HostService::new(
                dependencies.business,
                dependencies.worker.clone(),
                dependencies.rls_secret.clone(),
                dependencies.ids,
                Arc::new(webdock_plugin_host::FileBindings::new(
                    config.host_bindings.clone(),
                )),
                crate::plugin_config::signing_key(&config.invocation_signing_key)?,
            )
            .await?
            .with_session_authority(
                dependencies.auth.clone(),
                dependencies.identity.clone(),
                dependencies.browser.clone(),
            )
            .await?
            .with_mcp_authority(dependencies.oauth)?,
        );
        let repository = match &config.repository {
            Some(repository) => Some(Arc::new(
                webdock_build::RepositoryAdmission::new(
                    dependencies.worker,
                    dependencies.rls_secret,
                    host.clone(),
                    crate::plugin_config::signing_key(&repository.signing_key)?,
                    Arc::new(webdock_build::FileRepositoryBindings::new(
                        repository.bindings.clone(),
                    )),
                )
                .await?
                .with_session_authority(
                    dependencies.auth,
                    dependencies.identity,
                    dependencies.browser,
                )
                .await?,
            )),
            None => None,
        };
        Ok(Self {
            host,
            connections: RuntimeConnections::new(config.connections.clone()),
            repository,
            mcp_client: config.mcp_client.clone(),
        })
    }
}

#[path = "plugin_exposure.rs"]
mod exposure;
#[path = "plugin_operations.rs"]
mod operations;

pub(crate) fn credential_endpoint(path: &str) -> bool {
    exposure::credential_endpoint(path)
}
