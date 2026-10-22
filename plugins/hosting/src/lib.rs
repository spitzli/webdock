//! Hosting as a plugin: apps from a container image, with port, memory, environment, logs and
//! power controls. The Core admits every call; this plugin checks again that an app belongs to the
//! invoking project before touching it.
pub mod placement;
pub mod store;
pub use webdock_plugin_kit::seal;

use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
use uuid::Uuid;
use webdock_plugin_protocol::{ErrorCode, InvocationClaims, Manifest, PluginError};
use webdock_plugin_runtime::ActionHandler;

type Result<T> = std::result::Result<T, PluginError>;
pub const PLUGIN_ID: &str = "hosting";
const ACTIONS: &[(&str, &str)] = &[
    ("apps.create", "write"),
    ("apps.view", "read"),
    ("apps.logs", "read"),
    ("apps.deploy", "write"),
    ("apps.env", "write"),
    ("apps.power", "write"),
    ("apps.resize", "write"),
    ("apps.delete", "write"),
];
pub const MEMORY_MB: &[u32] = &[128, 256, 512, 1024, 2048];
fn invalid(message: &str) -> PluginError {
    PluginError::new(ErrorCode::InvalidInput, message)
}
fn missing() -> PluginError {
    PluginError::new(ErrorCode::NotFound, "App not found")
}
fn unavailable(context: &str, error: impl std::fmt::Display) -> PluginError {
    eprintln!("hosting_plugin_{context}: {error}");
    PluginError::new(ErrorCode::Unavailable, "Hosting service is unavailable")
}
fn store_error(error: store::Error) -> PluginError {
    unavailable("store", error)
}
fn parse<T: for<'a> Deserialize<'a>>(input: Value) -> Result<T> {
    serde_json::from_value(input).map_err(|_| invalid("Invalid app request"))
}

/// A registry reference such as `nginx:1.29-alpine` or `ghcr.io/org/app@sha256:…`.
pub fn image_reference(raw: &str, require_digest: bool) -> Result<String> {
    let image = raw.trim();
    let (name, digest) = image
        .split_once('@')
        .map_or((image, None), |(n, d)| (n, Some(d)));
    let valid_digest = digest.is_none_or(|d| {
        d.strip_prefix("sha256:").is_some_and(|h| {
            h.len() == 64
                && h.bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        })
    });
    if image.is_empty()
        || image.len() > 512
        || name.starts_with(['-', '.', '/', ':'])
        || !name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"./:_-".contains(&b))
        || name.contains("//")
        || !valid_digest
        || (require_digest && digest.is_none())
    {
        return Err(invalid(if require_digest {
            "Use an image pinned by digest (name@sha256:…)"
        } else {
            "Invalid image reference"
        }));
    }
    Ok(image.into())
}
/// `KEY=value` lines; blank lines and `#` comments are skipped. Keys follow shell rules.
pub fn environment(raw: &str) -> Result<Vec<(String, String)>> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for line in raw
        .lines()
        .map(str::trim_end)
        .filter(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'))
    {
        let (key, value) = line
            .split_once('=')
            .ok_or_else(|| invalid("Write each variable as KEY=value"))?;
        let key = key.trim();
        if key.is_empty()
            || key.len() > 128
            || key.starts_with(|c: char| c.is_ascii_digit())
            || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
            || value.chars().any(|c| c.is_control() && c != '\t')
            || !seen.insert(key.to_owned())
        {
            return Err(invalid("Invalid or repeated variable name"));
        }
        out.push((key.to_owned(), value.to_owned()));
    }
    if out.len() > 100 {
        return Err(invalid("At most 100 variables"));
    }
    Ok(out)
}
fn display_name(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 63 || value.chars().any(char::is_control) {
        return Err(invalid("Invalid app name"));
    }
    Ok(value.into())
}
fn port(value: i64) -> Result<u16> {
    u16::try_from(value)
        .ok()
        .filter(|p| *p >= 1)
        .ok_or_else(|| invalid("Invalid port"))
}
fn memory(value: i64) -> Result<u32> {
    u32::try_from(value)
        .ok()
        .filter(|m| MEMORY_MB.contains(m))
        .ok_or_else(|| invalid("Invalid memory size"))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NewApp {
    name: String,
    image: String,
    port: i64,
    memory_mb: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Target {
    resource_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Deploy {
    resource_id: String,
    image: String,
    port: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Env {
    resource_id: String,
    env: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Power {
    resource_id: String,
    action: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Resize {
    resource_id: String,
    memory_mb: i64,
}

pub struct Settings {
    /// Production requires digest-pinned images; local dev accepts tags.
    pub require_digest: bool,
}
pub struct Plugin {
    store: store::Store,
    sealer: seal::Sealer,
    placement: placement::Placement,
    settings: Settings,
    deploying: Mutex<HashSet<Uuid>>,
}
impl Plugin {
    pub fn new(
        store: store::Store,
        sealer: seal::Sealer,
        placement: placement::Placement,
        settings: Settings,
    ) -> Arc<Self> {
        Arc::new(Self {
            store,
            sealer,
            placement,
            settings,
            deploying: Mutex::new(HashSet::new()),
        })
    }
    /// Finish deployments interrupted by a restart.
    pub async fn resume(self: &Arc<Self>) -> std::result::Result<(), store::Error> {
        for app in self.store.deploying().await? {
            let _ = self.deploy(app);
        }
        Ok(())
    }
    fn env(&self, app: &store::App) -> Result<Vec<(String, String)>> {
        let raw = self
            .sealer
            .open(&app.id, &app.env_sealed)
            .ok_or_else(|| unavailable("unseal", app.id))?;
        environment(&raw)
    }
    async fn target(&self, claims: &InvocationClaims, id: &str) -> Result<store::App> {
        let id = Uuid::parse_str(id).map_err(|_| invalid("Invalid app"))?;
        self.store
            .get(&claims.project_id, &id)
            .await
            .map_err(store_error)?
            .ok_or_else(missing)
    }
    /// Runs detached: pulling an image outlasts an invocation. One deployment per app at a time.
    fn deploy(self: &Arc<Self>, app: store::App) -> Result<()> {
        if !self
            .deploying
            .lock()
            .map_err(|_| unavailable("lock", "poisoned"))?
            .insert(app.id)
        {
            return Err(PluginError::new(
                ErrorCode::Conflict,
                "A deployment of this app is in progress",
            ));
        }
        let plugin = Arc::clone(self);
        tokio::spawn(async move {
            let outcome = async {
                let env = plugin.env(&app).map_err(|e| e.message)?;
                let spec = placement::Spec {
                    image: &app.image,
                    port: u16::try_from(app.port).map_err(|_| "Invalid port".to_owned())?,
                    memory_mb: u32::try_from(app.memory_mb)
                        .map_err(|_| "Invalid memory".to_owned())?,
                    env: &env,
                    running: app.running,
                };
                plugin
                    .placement
                    .deploy(&app.id, &spec)
                    .await
                    .map_err(|error| {
                        eprintln!("hosting_plugin_deploy: {error}");
                        "The image could not be pulled or started. Check the image name.".to_owned()
                    })
            }
            .await;
            if let Err(error) = plugin
                .store
                .outcome(&app.id, outcome.err().as_deref())
                .await
            {
                eprintln!("hosting_plugin_store: {error}");
            }
            if let Ok(mut deploying) = plugin.deploying.lock() {
                deploying.remove(&app.id);
            }
        });
        Ok(())
    }
    async fn create(self: &Arc<Self>, claims: &InvocationClaims, input: Value) -> Result<Value> {
        let input: NewApp = parse(input)?;
        let id = Uuid::new_v4();
        let app = store::App {
            id,
            project_id: claims.project_id.clone(),
            name: display_name(&input.name)?,
            image: image_reference(&input.image, self.settings.require_digest)?,
            port: i32::from(port(input.port)?),
            memory_mb: i32::try_from(memory(input.memory_mb)?)
                .map_err(|_| invalid("Invalid memory size"))?,
            env_sealed: self.sealer.seal(&id, ""),
            running: true,
            state: "deploying".into(),
            error: None,
            created_at: String::new(),
        };
        self.store.insert(&app).await.map_err(store_error)?;
        let name = app.name.clone();
        self.deploy(app)?;
        Ok(json!({"resource":{"id":id.to_string(),"name":name}}))
    }
    async fn view(&self, claims: &InvocationClaims, input: Value) -> Result<Value> {
        let target: Target = parse(input)?;
        let app = self.target(claims, &target.resource_id).await?;
        let observed = self
            .placement
            .observe(&app.id)
            .await
            .map_err(|e| unavailable("observe", e))?;
        let status = match (app.state.as_str(), &observed) {
            ("deploying", _) => "deploying",
            ("failed", _) => "failed",
            (_, Some(o)) if o.running => "running",
            (_, Some(_)) => "stopped",
            (_, None) => "missing",
        };
        let url = observed
            .as_ref()
            .and_then(|o| o.host_port)
            .filter(|_| status == "running")
            .map(|p| format!("http://{}:{p}", self.placement.host()));
        let keys = self
            .env(&app)?
            .into_iter()
            .map(|(k, _)| k)
            .collect::<Vec<_>>();
        Ok(json!({
            "name": app.name, "status": status, "image": app.image, "port": app.port, "memoryMb": app.memory_mb,
            "url": url, "env": keys, "error": app.error, "restarts": observed.map(|o| o.restarts), "createdAt": app.created_at,
        }))
    }
    /// Stores the changed app and redeploys it.
    async fn change(self: &Arc<Self>, app: store::App) -> Result<Value> {
        if self
            .deploying
            .lock()
            .map_err(|_| unavailable("lock", "poisoned"))?
            .contains(&app.id)
        {
            return Err(PluginError::new(
                ErrorCode::Conflict,
                "A deployment of this app is in progress",
            ));
        }
        self.store.update(&app).await.map_err(store_error)?;
        self.deploy(app)?;
        Ok(json!({"status":"deploying"}))
    }
}

pub struct Handler(pub Arc<Plugin>);
#[tonic::async_trait]
impl ActionHandler for Handler {
    async fn invoke(
        &self,
        claims: &InvocationClaims,
        _token: &str,
        input: Value,
        configuration: Value,
    ) -> Result<Value> {
        if configuration != json!({}) {
            return Err(invalid("Invalid app request"));
        }
        let plugin = &self.0;
        match claims.action.as_str() {
            "apps.create" => plugin.create(claims, input).await,
            "apps.view" => plugin.view(claims, input).await,
            "apps.logs" => {
                let target: Target = parse(input)?;
                let app = plugin.target(claims, &target.resource_id).await?;
                let lines = plugin
                    .placement
                    .logs(&app.id, 200)
                    .await
                    .map_err(|e| unavailable("logs", e))?;
                Ok(json!({"lines": lines}))
            }
            "apps.deploy" => {
                let input: Deploy = parse(input)?;
                let mut app = plugin.target(claims, &input.resource_id).await?;
                app.image = image_reference(&input.image, plugin.settings.require_digest)?;
                app.port = i32::from(port(input.port)?);
                plugin.change(app).await
            }
            "apps.env" => {
                let input: Env = parse(input)?;
                let mut app = plugin.target(claims, &input.resource_id).await?;
                environment(&input.env)?;
                app.env_sealed = plugin.sealer.seal(&app.id, &input.env);
                plugin.change(app).await
            }
            "apps.resize" => {
                let input: Resize = parse(input)?;
                let mut app = plugin.target(claims, &input.resource_id).await?;
                app.memory_mb = i32::try_from(memory(input.memory_mb)?)
                    .map_err(|_| invalid("Invalid memory size"))?;
                plugin.change(app).await
            }
            "apps.power" => {
                let input: Power = parse(input)?;
                let app = plugin.target(claims, &input.resource_id).await?;
                if !["start", "stop", "restart"].contains(&input.action.as_str()) {
                    return Err(invalid("Unknown power action"));
                }
                if app.state != "ready" {
                    return Err(PluginError::new(
                        ErrorCode::Conflict,
                        "The app is not deployed",
                    ));
                }
                plugin
                    .placement
                    .power(&app.id, &input.action)
                    .await
                    .map_err(|e| unavailable("power", e))?;
                plugin
                    .store
                    .running(&app.id, input.action != "stop")
                    .await
                    .map_err(store_error)?;
                Ok(json!({}))
            }
            "apps.delete" => {
                let target: Target = parse(input)?;
                let app = plugin.target(claims, &target.resource_id).await?;
                if plugin
                    .deploying
                    .lock()
                    .map_err(|_| unavailable("lock", "poisoned"))?
                    .contains(&app.id)
                {
                    return Err(PluginError::new(
                        ErrorCode::Conflict,
                        "A deployment of this app is in progress",
                    ));
                }
                plugin
                    .placement
                    .remove(&app.id)
                    .await
                    .map_err(|e| unavailable("remove", e))?;
                plugin.store.delete(&app.id).await.map_err(store_error)?;
                Ok(json!({}))
            }
            _ => Err(PluginError::new(
                ErrorCode::NotSupported,
                "Hosting action unavailable",
            )),
        }
    }
}

/// The runtime refuses to start with any manifest other than the reviewed contract.
pub fn validate_manifest(manifest: &Manifest) -> Result<()> {
    let value = manifest.as_json();
    if manifest.id() != PLUGIN_ID
        || value["capabilities"] != json!([])
        || value["httpBindings"] != json!([])
        || value["actions"]
            .as_array()
            .is_none_or(|a| a.len() != ACTIONS.len())
        || !ACTIONS.iter().all(|(name, intent)| {
            manifest.action(name).is_some_and(|action| {
                action["intent"] == *intent && action["capabilities"] == json!([])
            })
        })
    {
        return Err(invalid("Invalid hosting manifest"));
    }
    Ok(())
}
