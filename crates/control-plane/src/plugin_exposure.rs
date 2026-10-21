use super::*;
use crate::resource_auth::{self, Resource};
use axum::{
    extract::{Path, Request},
    http::Method,
    routing::any,
};
use rmcp::{
    RoleServer, ServerHandler,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ListToolsResult,
        PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
    },
    service::RequestContext,
};
use tower::ServiceExt;
use webdock_oauth::McpAuthentication;

pub(super) fn routes() -> Router<Arc<ServiceState>> {
    Router::new()
        .route(
            "/v1/plugins/{plugin}/projects/{project}/api/{*path}",
            any(api),
        )
        .route("/api/mcp", any(mcp))
}
pub(super) fn credential_endpoint(path: &str) -> bool {
    path == "/api/mcp" || path.starts_with("/v1/plugins/")
}
fn route_action<'a>(manifest: &'a Value, method: &str, path: &str) -> Option<&'a Value> {
    let route = manifest["api"]
        .as_array()?
        .iter()
        .find(|r| r["method"] == method && r["path"] == path)?;
    manifest["actions"]
        .as_array()?
        .iter()
        .find(|a| a["name"] == route["action"])
}
async fn api(
    State(state): State<Arc<ServiceState>>,
    Path((plugin, project, path)): Path<(String, String, String)>,
    request: Request,
) -> Response {
    let result: Result<Response, Response> = async {
        let read = request.method() == Method::GET;
        let actor =
            resource_auth::authenticate(&state, request.headers(), Resource::Registry, false)
                .await
                .map_err(IntoResponse::into_response)?;
        // Retain the existing plugin API's 401 insufficient-write response.
        if !read && !actor.authority.can_write() {
            return Err(reject(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Bearer authorization is no longer valid.",
            )
            .into_response());
        }
        let endpoint = endpoints(&state).map_err(IntoResponse::into_response)?;
        let view = endpoint
            .host
            .project_plugins_with_mcp(&actor.principal, &project, &actor.authority)
            .await
            .map_err(|e| failure(e).into_response())?
            .into_iter()
            .find(|v| v.manifest["name"] == plugin)
            .ok_or_else(|| {
                reject(
                    StatusCode::NOT_FOUND,
                    "not_found",
                    "Plugin route unavailable.",
                )
                .into_response()
            })?;
        let action = route_action(
            &view.manifest,
            request.method().as_str(),
            &format!("/{path}"),
        )
        .ok_or_else(|| {
            reject(
                StatusCode::NOT_FOUND,
                "not_found",
                "Plugin route unavailable.",
            )
            .into_response()
        })?;
        let key = request
            .headers()
            .get("idempotency-key")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .or_else(|| (action["intent"] == "read").then(|| uuid::Uuid::new_v4().to_string()))
            .ok_or_else(|| {
                reject(
                    StatusCode::BAD_REQUEST,
                    "invalid_input",
                    "Idempotency-Key required.",
                )
                .into_response()
            })?;
        let action = action["name"]
            .as_str()
            .ok_or_else(|| failure(unavailable_plugin()).into_response())?
            .to_owned();
        let input = if read {
            let parameters =
                url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes())
                    .collect::<Vec<_>>();
            if parameters.len() > 1
                || parameters
                    .first()
                    .is_some_and(|p| p.0 != "input" || p.1.len() > 32768)
            {
                return Err(reject(
                    StatusCode::BAD_REQUEST,
                    "invalid_input",
                    "Use one input JSON query parameter.",
                )
                .into_response());
            }
            match parameters.first() {
                Some(p) if !p.1.is_empty() => serde_json::from_str(&p.1).map_err(|_| {
                    reject(
                        StatusCode::BAD_REQUEST,
                        "invalid_input",
                        "Invalid plugin input.",
                    )
                    .into_response()
                })?,
                _ => json!({}),
            }
        } else {
            let headers = request.headers().clone();
            let body = axum::body::to_bytes(request.into_body(), 32768)
                .await
                .map_err(|_| {
                    reject(
                        StatusCode::PAYLOAD_TOO_LARGE,
                        "invalid_input",
                        "Plugin input exceeds limit.",
                    )
                    .into_response()
                })?;
            json_body(&body, &headers).map_err(IntoResponse::into_response)?
        };
        let value = endpoint
            .invoke_mcp(
                &actor,
                AdmissionInput {
                    plugin_id: plugin,
                    project_id: project,
                    action,
                    input,
                    idempotency_key: key,
                },
            )
            .await
            .map_err(|e| failure(e).into_response())?;
        Ok(Json(value).into_response())
    }
    .await;
    result.unwrap_or_else(IntoResponse::into_response)
}
struct ExposedTool {
    tool: Tool,
    plugin: String,
    action: String,
    write: bool,
}
fn tools(
    views: &[webdock_plugin_host::PluginView],
    can_write: bool,
) -> Result<Vec<ExposedTool>, PluginError> {
    let mut output = Vec::new();
    let mut names = std::collections::HashSet::new();
    for view in views {
        if view.state != "enabled" || view.runtime != "ready" {
            continue;
        }
        let m = &view.manifest;
        let Some(exposed) = m["mcp"].as_array() else {
            continue;
        };
        for entry in exposed {
            let Some(action) = m["actions"]
                .as_array()
                .and_then(|a| a.iter().find(|a| a["name"] == entry["action"]))
            else {
                continue;
            };
            let write = action["intent"] == "write";
            if write && !can_write {
                continue;
            }
            let plugin = m["name"].as_str().ok_or_else(unavailable_plugin)?;
            let name = format!(
                "plugin__{}__{}",
                plugin.replace('-', "_"),
                entry["name"].as_str().ok_or_else(unavailable_plugin)?
            );
            if !names.insert(name.clone()) {
                return Err(PluginError::new(
                    ErrorCode::Conflict,
                    "Plugin MCP tool collision",
                ));
            }
            let input = action.get("input").cloned().unwrap_or_else(
                || json!({"type":"object","properties":{},"additionalProperties":false}),
            );
            let mut required = vec!["projectID", "input"];
            if write {
                required.push("idempotencyKey");
            }
            let tool:Tool=serde_json::from_value(json!({"name":name,"description":entry["description"],"inputSchema":{"type":"object","properties":{"projectID":{"type":"string","pattern":"^[0-9]{1,20}$"},"input":input,"idempotencyKey":{"type":"string","minLength":1,"maxLength":128}},"required":required,"additionalProperties":false},"annotations":{"readOnlyHint":!write,"destructiveHint":action["destructive"].as_bool().unwrap_or(false)}})).map_err(|_|unavailable_plugin())?;
            output.push(ExposedTool {
                tool,
                plugin: plugin.into(),
                action: action["name"]
                    .as_str()
                    .ok_or_else(unavailable_plugin)?
                    .into(),
                write,
            });
        }
    }
    Ok(output)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ToolArguments {
    #[serde(rename = "projectID")]
    project_id: String,
    input: Value,
    idempotency_key: Option<String>,
}
#[derive(Clone)]
struct McpHandler {
    state: Arc<ServiceState>,
    actor: Arc<McpAuthentication>,
    resource: Resource,
}
impl ServerHandler for McpHandler {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_server_info(
            rmcp::model::Implementation::new(
                if self.resource == Resource::Registry {
                    "webdock-studio"
                } else {
                    "webdock-hosting"
                },
                "1.0.0",
            ),
        )
    }
    async fn list_tools(
        &self,
        request: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, rmcp::ErrorData> {
        if request.as_ref().is_some_and(|p| p.cursor.is_some()) {
            return Err(rmcp::ErrorData::invalid_params("Cursor unavailable", None));
        }
        let oauth =
            self.state.oauth.as_ref().ok_or_else(|| {
                rmcp::ErrorData::internal_error("Authorization unavailable", None)
            })?;
        let guard = oauth
            .begin_mcp_authority(&self.actor.authority)
            .await
            .map_err(|_| {
                rmcp::ErrorData::invalid_request("Authorization is no longer valid", None)
            })?;
        let can_write = guard.can_write();
        // Domain discovery below acquires and verifies its own guard. Release this
        // preliminary check first so a single-connection auth pool remains usable.
        drop(guard);
        let mut definitions = crate::first_party_mcp::tools(&self.state, self.resource, can_write)?;
        if self.resource == Resource::Registry {
            if self.state.registry.is_some() {
                // Public registry discovery requires the same current mapped operator as a read.
                crate::resource_registry::execute(
                    &self.state,
                    &self.actor,
                    crate::resource_registry::Operation::List(
                        json!({"collection":"customers","limit":1}),
                    ),
                )
                .await
                .map_err(|_| {
                    rmcp::ErrorData::invalid_request("Registry access unavailable", None)
                })?;
            }
            if let Some(endpoint) = &self.state.plugins {
                let views = endpoint
                    .host
                    .mcp_plugins(&self.actor.principal, &self.actor.authority)
                    .await
                    .map_err(mcp_error)?;
                definitions.extend(
                    tools(&views, can_write)
                        .map_err(mcp_error)?
                        .into_iter()
                        .map(|t| t.tool),
                );
            }
        }
        Ok(ListToolsResult {
            tools: definitions,
            ..ListToolsResult::default()
        })
    }
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, rmcp::ErrorData> {
        if !request.name.starts_with("plugin__") {
            if request.input_responses.is_some() || request.request_state.is_some() {
                return Err(rmcp::ErrorData::invalid_params(
                    "Continuation unavailable",
                    None,
                ));
            }
            let result = crate::first_party_mcp::execute(
                &self.state,
                &self.actor,
                self.resource,
                &request.name,
                Value::Object(request.arguments.unwrap_or_default()),
            )
            .await;
            let result = match result {
                Ok(value) => CallToolResult::success(vec![ContentBlock::text(value.to_string())]),
                Err(response) => {
                    let body = axum::body::to_bytes(response.into_response().into_body(), 65536)
                        .await
                        .unwrap_or_default();
                    CallToolResult::error(vec![ContentBlock::text(String::from_utf8_lossy(&body))])
                }
            };
            return Ok(result.into());
        }
        let result: Result<Value, PluginError> = async {
            if request.input_responses.is_some() || request.request_state.is_some() {
                return Err(PluginError::new(
                    ErrorCode::InvalidInput,
                    "Continuation unavailable",
                ));
            }
            if self.resource != Resource::Registry {
                return Err(PluginError::denied());
            }
            let endpoint = self.state.plugins.as_ref().ok_or_else(unavailable_plugin)?;
            let views = endpoint
                .host
                .mcp_plugins(&self.actor.principal, &self.actor.authority)
                .await?;
            let tool = tools(&views, self.actor.authority.can_write())?
                .into_iter()
                .find(|t| t.tool.name == request.name)
                .ok_or_else(|| PluginError::new(ErrorCode::NotFound, "Plugin tool unavailable"))?;
            let input: ToolArguments =
                serde_json::from_value(Value::Object(request.arguments.unwrap_or_default()))
                    .map_err(|_| {
                        PluginError::new(ErrorCode::InvalidInput, "Invalid tool arguments")
                    })?;
            let project = input.project_id;
            let key = input
                .idempotency_key
                .or_else(|| (!tool.write).then(|| uuid::Uuid::new_v4().to_string()))
                .ok_or_else(PluginError::denied)?;
            endpoint
                .invoke_mcp(
                    &self.actor,
                    AdmissionInput {
                        plugin_id: tool.plugin,
                        project_id: project,
                        action: tool.action,
                        input: input.input,
                        idempotency_key: key,
                    },
                )
                .await
        }
        .await;
        Ok(match result {
            Ok(value) => CallToolResult::success(vec![ContentBlock::text(value.to_string())]),
            Err(error) => {
                CallToolResult::error(vec![ContentBlock::text(json!({"error":error}).to_string())])
            }
        }
        .into())
    }
}
fn mcp_error(_: PluginError) -> rmcp::ErrorData {
    rmcp::ErrorData::internal_error("Plugin discovery unavailable", None)
}
async fn registry_write_ceiling(
    state: &ServiceState,
    request: Request,
) -> Result<Request, resource_auth::ResourceFailure> {
    let (parts, body) = request.into_parts();
    let bytes = axum::body::to_bytes(body, 65536).await.map_err(|_| {
        resource_auth::ResourceFailure::from(reject(
            StatusCode::PAYLOAD_TOO_LARGE,
            "invalid_input",
            "Request is too large.",
        ))
    })?;
    if let Ok(value) = serde_json::from_slice::<Value>(&bytes)
        && value["method"] == "tools/call"
        && value["params"]["name"]
            .as_str()
            .is_some_and(|name| ["save_customer", "save_project", "set_archived"].contains(&name))
    {
        return Err(resource_auth::challenge(
            state,
            "webdock:read webdock:write",
            StatusCode::FORBIDDEN,
        ));
    }
    Ok(Request::from_parts(parts, axum::body::Body::from(bytes)))
}
async fn mcp(State(state): State<Arc<ServiceState>>, request: Request) -> Response {
    let (actor, resource) =
        match resource_auth::authenticate(&state, request.headers(), Resource::Registry, false)
            .await
        {
            Ok(actor) => (actor, Resource::Registry),
            Err(registry_error) => {
                if registry_error.status() != StatusCode::UNAUTHORIZED {
                    return registry_error.into_response();
                }
                match resource_auth::authenticate(
                    &state,
                    request.headers(),
                    Resource::Hosting,
                    false,
                )
                .await
                {
                    Ok(actor) => (actor, Resource::Hosting),
                    Err(error) if error.status() == StatusCode::UNAUTHORIZED => {
                        return registry_error.into_response();
                    }
                    Err(error) => return error.into_response(),
                }
            }
        };
    let request = if resource == Resource::Registry && !actor.authority.can_write() {
        match registry_write_ceiling(&state, request).await {
            Ok(request) => request,
            Err(error) => return error.into_response(),
        }
    } else {
        request
    };
    let handler = McpHandler {
        state: state.clone(),
        actor,
        resource,
    };
    let studio = url::Url::parse(&state.config.studio_origin).expect("validated origin");
    let authority = studio[url::Position::BeforeHost..url::Position::AfterPort].to_owned();
    let config = rmcp::transport::streamable_http_server::StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_allowed_hosts([authority])
        .with_allowed_origins([format!(
            "{}://{}:{}",
            studio.scheme(),
            studio.host_str().expect("validated host"),
            studio.port_or_known_default().expect("validated port")
        )])
        .with_max_request_body_bytes(65536);
    let service = rmcp::transport::streamable_http_server::StreamableHttpService::new(
        move || Ok(handler.clone()),
        Arc::new(
            rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default(),
        ),
        config,
    );
    match service.oneshot(request).await {
        Ok(response) => response.map(axum::body::Body::new),
        Err(error) => match error {},
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn view() -> webdock_plugin_host::PluginView {
        webdock_plugin_host::PluginView {
            state: "enabled".into(),
            runtime: "ready".into(),
            generation: 1,
            manifest_sha256: "a".repeat(64),
            launch_links: vec![],
            features: vec![],
            resources: vec![],
            manifest: json!({"name":"notes-fixture","actions":[{"name":"notes.read","intent":"read"},{"name":"notes.write","intent":"write","destructive":true}],"api":[{"method":"GET","path":"/notes","action":"notes.read"}],"mcp":[{"name":"read","action":"notes.read","description":"Read notes"},{"name":"write","action":"notes.write","description":"Write notes"}]}),
        }
    }
    #[test]
    fn readonly_tools_and_exact_api_routes() {
        let v = view();
        let listed = tools(std::slice::from_ref(&v), false).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].tool.name, "plugin__notes_fixture__read");
        assert_eq!(tools(std::slice::from_ref(&v), true).unwrap().len(), 2);
        assert!(tools(&[view(), view()], true).is_err());
        assert_eq!(
            route_action(&v.manifest, "GET", "/notes").unwrap()["name"],
            "notes.read"
        );
        assert!(route_action(&v.manifest, "POST", "/notes").is_none());
        assert!(route_action(&v.manifest, "GET", "/notes/extra").is_none());
    }
}
