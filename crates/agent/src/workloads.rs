//! Plugin workloads: Core sends the pinned objects of one unit; this applies them with
//! server-side apply, prunes objects that left the unit, and reports readiness. It checks the
//! pinning again and knows nothing about the products behind the objects.
use kube::{
    Client,
    api::{Api, DeleteParams, DynamicObject, ListParams, Patch, PatchParams, PostParams},
    core::{ApiResource, GroupVersionKind},
};
use serde_json::{Value, json};
use webdock_plugin_protocol::WORKLOAD_KINDS;

const MANAGER: &str = "webdock-workloads";
const OWNER: &str = "webdock.dev/";

/// What the agent reports for one unit.
pub struct Outcome {
    pub observed: Value,
    pub error: Option<String>,
    pub removed: bool,
}
pub struct WorkloadExecutor {
    client: Client,
}
fn resource(kind: &str) -> Option<ApiResource> {
    let (api_version, kind) = kind.rsplit_once('/')?;
    let (group, version) = api_version.rsplit_once('/').unwrap_or(("", api_version));
    Some(ApiResource::from_gvk(&GroupVersionKind::gvk(
        group, version, kind,
    )))
}
fn selector(plugin: &str, unit: &str) -> String {
    format!("{OWNER}plugin={plugin},{OWNER}unit={unit}")
}
fn failure(message: impl std::fmt::Display) -> String {
    let text = message.to_string();
    text.chars().take(300).collect()
}
impl WorkloadExecutor {
    pub fn new(client: Client) -> Self {
        Self { client }
    }
    /// Objects must carry the namespace and owner labels Core pinned; anything else is refused.
    fn check(plugin: &str, unit: &str, namespace: &str, objects: &[Value]) -> Result<(), String> {
        if !namespace.starts_with("wd-") {
            return Err("namespace not owned by workloads".into());
        }
        for object in objects {
            let kind = format!(
                "{}/{}",
                object["apiVersion"].as_str().unwrap_or_default(),
                object["kind"].as_str().unwrap_or_default()
            );
            let labels = &object["metadata"]["labels"];
            if !WORKLOAD_KINDS.contains(&kind.as_str())
                || object["metadata"]["namespace"] != namespace
                || labels[format!("{OWNER}plugin")] != plugin
                || labels[format!("{OWNER}unit")] != unit
                || labels[format!("{OWNER}managed-by")] != "webdock"
            {
                return Err(format!("object outside the unit: {kind}"));
            }
        }
        Ok(())
    }
    async fn namespace(&self, namespace: &str, plugin: &str) -> Result<(), String> {
        let api: Api<DynamicObject> = Api::all_with(
            self.client.clone(),
            &ApiResource::from_gvk(&GroupVersionKind::gvk("", "v1", "Namespace")),
        );
        match api.get_opt(namespace).await.map_err(failure)? {
            Some(existing) => {
                if existing
                    .metadata
                    .labels
                    .unwrap_or_default()
                    .get("webdock.dev/managed-by")
                    .map(String::as_str)
                    != Some("webdock")
                {
                    return Err("namespace exists but is not managed by Webdock".into());
                }
                Ok(())
            }
            None => {
                let object: DynamicObject = serde_json::from_value(json!({
                    "apiVersion": "v1", "kind": "Namespace",
                    "metadata": {"name": namespace, "labels": {
                        "webdock.dev/managed-by": "webdock", "webdock.dev/plugin": plugin,
                        "pod-security.kubernetes.io/enforce": "baseline",
                    }},
                }))
                .map_err(failure)?;
                api.create(&PostParams::default(), &object)
                    .await
                    .map_err(failure)?;
                Ok(())
            }
        }
    }
    /// Every object of the unit that exists now, across the allowed kinds.
    async fn existing(&self, namespace: &str, plugin: &str, unit: &str) -> Vec<(String, String)> {
        let mut found = Vec::new();
        for kind in WORKLOAD_KINDS {
            let Some(resource) = resource(kind) else {
                continue;
            };
            let api: Api<DynamicObject> =
                Api::namespaced_with(self.client.clone(), namespace, &resource);
            // Kinds whose CRD is not installed simply have nothing to list.
            if let Ok(list) = api
                .list(&ListParams::default().labels(&selector(plugin, unit)))
                .await
            {
                found.extend(
                    list.items
                        .into_iter()
                        .filter_map(|o| o.metadata.name)
                        .map(|name| ((*kind).to_owned(), name)),
                );
            }
        }
        found
    }
    async fn delete(&self, namespace: &str, kind: &str, name: &str) -> Result<(), String> {
        let resource = resource(kind).ok_or("unknown kind")?;
        let api: Api<DynamicObject> =
            Api::namespaced_with(self.client.clone(), namespace, &resource);
        match api.delete(name, &DeleteParams::background()).await {
            Ok(_) => Ok(()),
            Err(kube::Error::Api(status)) if status.code == 404 => Ok(()),
            Err(error) => Err(failure(error)),
        }
    }
    pub async fn handle(
        &self,
        plugin: &str,
        unit: &str,
        namespace: &str,
        objects_json: &[u8],
        removing: bool,
    ) -> Outcome {
        if removing {
            let existing = self.existing(namespace, plugin, unit).await;
            for (kind, name) in &existing {
                if let Err(error) = self.delete(namespace, kind, name).await {
                    return Outcome {
                        observed: json!({"ready": false}),
                        error: Some(error),
                        removed: false,
                    };
                }
            }
            return Outcome {
                observed: json!({"ready": false}),
                error: None,
                removed: existing.is_empty(),
            };
        }
        let objects: Vec<Value> = match serde_json::from_slice(objects_json) {
            Ok(objects) => objects,
            Err(error) => {
                return Outcome {
                    observed: json!({"ready": false}),
                    error: Some(failure(error)),
                    removed: false,
                };
            }
        };
        match self.apply(plugin, unit, namespace, &objects).await {
            Ok(observed) => Outcome {
                observed,
                error: None,
                removed: false,
            },
            Err(error) => Outcome {
                observed: json!({"ready": false}),
                error: Some(error),
                removed: false,
            },
        }
    }
    async fn apply(
        &self,
        plugin: &str,
        unit: &str,
        namespace: &str,
        objects: &[Value],
    ) -> Result<Value, String> {
        Self::check(plugin, unit, namespace, objects)?;
        self.namespace(namespace, plugin).await?;
        let mut wanted = Vec::new();
        for object in objects {
            let kind = format!(
                "{}/{}",
                object["apiVersion"].as_str().unwrap_or_default(),
                object["kind"].as_str().unwrap_or_default()
            );
            let name = object["metadata"]["name"]
                .as_str()
                .unwrap_or_default()
                .to_owned();
            let resource = resource(&kind).ok_or("unknown kind")?;
            let api: Api<DynamicObject> =
                Api::namespaced_with(self.client.clone(), namespace, &resource);
            api.patch(
                &name,
                &PatchParams::apply(MANAGER).force(),
                &Patch::Apply(object),
            )
            .await
            .map_err(|e| failure(format!("{kind} {name}: {e}")))?;
            wanted.push((kind, name));
        }
        for (kind, name) in self.existing(namespace, plugin, unit).await {
            if !wanted.contains(&(kind.clone(), name.clone())) {
                self.delete(namespace, &kind, &name).await?;
            }
        }
        self.observe(namespace, plugin, unit, &wanted).await
    }
    async fn observe(
        &self,
        namespace: &str,
        plugin: &str,
        unit: &str,
        wanted: &[(String, String)],
    ) -> Result<Value, String> {
        let mut states = Vec::new();
        let mut ready = true;
        for (kind, name) in wanted {
            let resource = resource(kind).ok_or("unknown kind")?;
            let api: Api<DynamicObject> =
                Api::namespaced_with(self.client.clone(), namespace, &resource);
            let object = api.get_opt(name).await.map_err(failure)?;
            let status = object
                .as_ref()
                .map(|o| o.data["status"].clone())
                .unwrap_or(Value::Null);
            let spec = object
                .as_ref()
                .map(|o| o.data["spec"].clone())
                .unwrap_or(Value::Null);
            let (is_ready, message) = match kind.as_str() {
                "apps/v1/Deployment" | "apps/v1/StatefulSet" => {
                    let want = spec["replicas"].as_i64().unwrap_or(1);
                    let have = status["readyReplicas"].as_i64().unwrap_or(0);
                    (have >= want, format!("{have}/{want} ready"))
                }
                "postgresql.cnpg.io/v1/Cluster" => {
                    let want = spec["instances"].as_i64().unwrap_or(1);
                    let have = status["readyInstances"].as_i64().unwrap_or(0);
                    (
                        have >= want,
                        status["phase"].as_str().unwrap_or("pending").to_owned(),
                    )
                }
                _ => (object.is_some(), String::new()),
            };
            ready &= is_ready;
            states.push(json!({"kind": kind, "name": name, "ready": is_ready, "message": message}));
        }
        // Why pods are not running, in the operator's and customer's words: pull and crash states.
        let pods: Api<DynamicObject> = Api::namespaced_with(
            self.client.clone(),
            namespace,
            &ApiResource::from_gvk(&GroupVersionKind::gvk("", "v1", "Pod")),
        );
        let mut problems = Vec::new();
        let mut logs = Vec::new();
        if let Ok(list) = pods
            .list(&ListParams::default().labels(&selector(plugin, unit)))
            .await
        {
            let typed: Api<k8s_openapi::api::core::v1::Pod> =
                Api::namespaced(self.client.clone(), namespace);
            if let Some(name) = list.items.iter().find_map(|p| p.metadata.name.clone())
                && let Ok(text) = typed
                    .logs(
                        &name,
                        &kube::api::LogParams {
                            tail_lines: Some(100),
                            timestamps: true,
                            ..Default::default()
                        },
                    )
                    .await
            {
                // The newest lines, at most 24 KiB, without control characters.
                let mut budget = 24 * 1024;
                for line in text.lines().rev() {
                    let clean: String = line
                        .chars()
                        .filter(|c| !c.is_control() || *c == '\t')
                        .collect();
                    if clean.len() > budget {
                        break;
                    }
                    budget -= clean.len();
                    logs.push(clean);
                }
                logs.reverse();
            }
            for pod in list.items {
                for container in pod.data["status"]["containerStatuses"]
                    .as_array()
                    .into_iter()
                    .flatten()
                {
                    if let Some(reason) = container["state"]["waiting"]["reason"].as_str()
                        && reason != "ContainerCreating"
                        && reason != "PodInitializing"
                    {
                        problems.push(json!({"container": container["name"], "reason": reason, "restarts": container["restartCount"]}));
                    }
                }
            }
        }
        Ok(json!({"ready": ready, "objects": states, "problems": problems, "logs": logs}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn service(namespace: &str, unit: &str) -> Value {
        json!({"apiVersion":"v1","kind":"Service","metadata":{"name":"web","namespace":namespace,
               "labels":{"webdock.dev/managed-by":"webdock","webdock.dev/plugin":"hosting","webdock.dev/unit":unit}}})
    }
    #[test]
    fn objects_must_stay_in_their_unit() {
        assert!(
            WorkloadExecutor::check(
                "hosting",
                "a",
                "wd-hosting-1",
                &[service("wd-hosting-1", "a")]
            )
            .is_ok()
        );
        for objects in [
            vec![service("kube-system", "a")],
            vec![service("wd-hosting-1", "b")],
            vec![json!({"apiVersion":"v1","kind":"Pod","metadata":{"namespace":"wd-hosting-1"}})],
        ] {
            assert!(WorkloadExecutor::check("hosting", "a", "wd-hosting-1", &objects).is_err());
        }
        assert!(
            WorkloadExecutor::check(
                "hosting",
                "a",
                "kube-system",
                &[service("kube-system", "a")]
            )
            .is_err()
        );
        assert_eq!(
            resource("traefik.io/v1alpha1/IngressRoute").unwrap().plural,
            "ingressroutes"
        );
        assert_eq!(resource("v1/Service").unwrap().group, "");
    }
}
