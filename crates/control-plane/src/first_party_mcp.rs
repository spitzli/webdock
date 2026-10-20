//! Native tools share the bearer resource adapters and their transaction guards.
use crate::resource_auth::ResourceFailure;
use crate::{
    http::ServiceState,
    resource_auth::Resource,
    resource_hosting,
    resource_registry::{self, Collection, Operation},
};
use axum::http::StatusCode;
use rmcp::model::Tool;
use serde::Deserialize;
use serde_json::{Value, json};
use webdock_oauth::McpAuthentication;

pub(crate) fn tools(
    state: &ServiceState,
    resource: Resource,
    write: bool,
) -> Result<Vec<Tool>, rmcp::ErrorData> {
    let definitions = match resource {
        Resource::Registry if state.registry.is_none() => vec![],
        Resource::Registry => registry_tools(write),
        Resource::Hosting => {
            if state.config.features.state("hosting")
                == webdock_core::features::FeatureState::Disabled
            {
                return Ok(vec![]);
            }
            hosting_tools(write)
        }
    };
    definitions
        .into_iter()
        .map(|v| {
            serde_json::from_value(v).map_err(|_| {
                rmcp::ErrorData::internal_error("Native tool schema is unavailable", None)
            })
        })
        .collect()
}
fn registry_tools(write: bool) -> Vec<Value> {
    let schemas = resource_registry::schemas();
    let id = json!({"type":"string","pattern":"^[1-9][0-9]{0,18}$"});
    let collection = json!({"enum":["customers","projects","audit-events"]});
    let mut tools = vec![
        json!({"name":"list_records","description":"List Webdock customers, projects and audit activity. Search, sort and paginate; no secrets or identity accounts.","inputSchema":schemas["filters"],"annotations":{"readOnlyHint":true,"openWorldHint":false}}),
        json!({"name":"get_record","description":"Read a registry record by its string ID.","inputSchema":{"type":"object","properties":{"collection":collection,"id":id},"required":["collection","id"],"additionalProperties":false},"annotations":{"readOnlyHint":true,"openWorldHint":false}}),
    ];
    if !write {
        return tools;
    }
    for (name, data) in [
        ("save_customer", schemas["customer"].clone()),
        ("save_project", schemas["project"].clone()),
    ] {
        tools.push(json!({"name":name,"description":"Create or edit a registry record. Omit id to create. Creates are not idempotent; do not retry an ambiguous write automatically.","inputSchema":{"type":"object","properties":{"id":id,"data":data},"required":["data"],"additionalProperties":false},"annotations":{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}}));
    }
    tools.push(json!({"name":"set_archived","description":"Archive or restore a customer/project after linked resources are retired. Does not delete data.","inputSchema":{"type":"object","properties":{"collection":{"enum":["customers","projects"]},"id":id,"archived":{"type":"boolean"}},"required":["collection","id","archived"],"additionalProperties":false},"annotations":{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}}));
    tools
}
fn hosting_tools(write: bool) -> Vec<Value> {
    let document = webdock_hosting::contracts::command_document();
    resource_hosting::TOOLS.iter().filter(|(action,_)|write||resource_hosting::is_read(action)).filter_map(|(action,name)|{
        let mut schema=document["oneOf"].as_array()?.iter().find(|s|s["properties"]["action"]["const"]==*action)?.clone();
        schema["properties"].as_object_mut()?.remove("action");
        schema["required"].as_array_mut()?.retain(|v|v!="action");
        Some(json!({"name":name,"description":format!("{action}. Applies current customer permissions, managed execution limits and retained-data rules. Inspect the returned operation before retrying ambiguous mutations."),"inputSchema":schema,"annotations":{"readOnlyHint":resource_hosting::is_read(action),"destructiveHint":(["clusters.revoke","apps.delete","apps.purgeStorage"].contains(action)),"idempotentHint":resource_hosting::is_read(action)||action.starts_with("apps.")||["clusters.register","projects.create"].contains(action),"openWorldHint":action.starts_with("apps.")}}))
    }).collect()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Get {
    collection: Collection,
    id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Save {
    id: Option<String>,
    data: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Archive {
    collection: Collection,
    id: String,
    archived: bool,
}
fn invalid() -> ResourceFailure {
    resource_registry::public_error(StatusCode::BAD_REQUEST, "Invalid tool arguments.")
}
fn parse<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, ResourceFailure> {
    serde_json::from_value(value).map_err(|_| invalid())
}
pub(crate) async fn execute(
    state: &ServiceState,
    actor: &McpAuthentication,
    resource: Resource,
    name: &str,
    args: Value,
) -> Result<Value, ResourceFailure> {
    if resource == Resource::Hosting {
        let (action, _) = resource_hosting::TOOLS
            .iter()
            .find(|(_, tool)| *tool == name)
            .ok_or_else(invalid)?;
        let mut args = args.as_object().ok_or_else(invalid)?.clone();
        if args.contains_key("action") {
            return Err(invalid());
        }
        args.insert("action".into(), json!(action));
        return resource_hosting::execute(state, actor, Value::Object(args)).await;
    }
    let operation = match name {
        "list_records" => Operation::List(args),
        "get_record" => {
            let Get { collection, id } = parse(args)?;
            Operation::Get { collection, id }
        }
        "save_customer" | "save_project" => {
            if args.get("id").is_some_and(Value::is_null) {
                return Err(invalid());
            }
            let Save { id, data } = parse(args)?;
            Operation::Save {
                collection: if name == "save_customer" {
                    Collection::Customers
                } else {
                    Collection::Projects
                },
                id,
                data,
            }
        }
        "set_archived" => {
            let Archive {
                collection,
                id,
                archived,
            } = parse(args)?;
            Operation::Archive {
                collection,
                id,
                archived,
            }
        }
        _ => return Err(invalid()),
    };
    resource_registry::execute(state, actor, operation).await
}
