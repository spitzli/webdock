//! Minimal reference extension: no capabilities, host services or external providers.
//! Useful as a local development and installation fixture.
use serde::Deserialize;
use serde_json::{Value, json};
use webdock_plugin_protocol::{ErrorCode, InvocationClaims, Manifest, PluginError};
use webdock_plugin_runtime::ActionHandler;

type Result<T> = std::result::Result<T, PluginError>;
pub const PLUGIN_ID: &str = "echo-demo";
fn invalid() -> PluginError {
    PluginError::new(ErrorCode::InvalidInput, "Invalid echo request")
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    #[serde(default)]
    message: String,
}
pub struct Echo;
#[tonic::async_trait]
impl ActionHandler for Echo {
    async fn invoke(
        &self,
        claims: &InvocationClaims,
        _token: &str,
        input: Value,
        configuration: Value,
    ) -> Result<Value> {
        if configuration != json!({}) {
            return Err(invalid());
        }
        let input: Input = serde_json::from_value(input).map_err(|_| invalid())?;
        if input.message.chars().count() > 200 || input.message.chars().any(char::is_control) {
            return Err(invalid());
        }
        match claims.action.as_str() {
            "demo.echo" => Ok(json!({"message":input.message,"projectID":claims.project_id})),
            "demo.panel" => Ok(json!({"version":1,"title":"Echo demo","blocks":[
                {"kind":"table","title":"Last echo","columns":[{"key":"message","label":"Message"},{"key":"project","label":"Project"}],
                 "rows":if input.message.is_empty(){json!([])}else{json!([{"message":input.message,"project":claims.project_id}])}},
                {"kind":"form","title":"Echo","fields":[{"name":"message","label":"Message","type":"text","required":true}],"action":{"id":"demo.panel","label":"Echo"}}
            ]})),
            _ => Err(PluginError::new(
                ErrorCode::NotSupported,
                "Echo action unavailable",
            )),
        }
    }
}
/// The runtime refuses to start with any manifest other than the reviewed demo contract.
pub fn validate_manifest(manifest: &Manifest) -> Result<()> {
    let value = manifest.as_json();
    if manifest.id() != PLUGIN_ID
        || value["capabilities"] != json!([])
        || value["httpBindings"] != json!([])
        || value["actions"].as_array().is_none_or(|a| a.len() != 2)
        || !["demo.echo", "demo.panel"].iter().all(|name| {
            manifest.action(name).is_some_and(|action| {
                action["intent"] == "read" && action["capabilities"] == json!([])
            })
        })
    {
        return Err(invalid());
    }
    Ok(())
}
