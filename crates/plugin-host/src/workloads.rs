//! `plugin.workloads`: a plugin runtime states the Kubernetes objects one unit (usually one
//! resource) needs. Core checks them against the manifest and a fixed safety policy, pins them to
//! the installation's namespace in the project and stamps owner labels; the cluster's agent
//! applies them and reports back. Calls authenticate the plugin runtime itself, not an invocation,
//! because provisioning outlasts one.
use super::*;
use webdock_plugin_protocol::WORKLOAD_KINDS;
use webdock_plugin_runtime::PeerIdentity;

const MAX_OBJECTS: usize = 32;
const MAX_BYTES: usize = 256 * 1024;
const OWNER: &str = "webdock.dev/";

fn dns_label(value: &str) -> bool {
    (1..=63).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !value.starts_with('-')
        && !value.ends_with('-')
}
/// `wd-<plugin>-<project>`; a plugin id too long for that is shortened to a hash. Plugins never
/// choose a namespace.
pub fn namespace(plugin: &str, project: &str) -> Result<String> {
    if project.is_empty() || project.len() > 20 || !project.bytes().all(|b| b.is_ascii_digit()) {
        return Err(invalid("Invalid project"));
    }
    let value = format!("wd-{plugin}-{project}");
    let value = if dns_label(&value) {
        value
    } else {
        format!("wd-{}-{project}", &digest(plugin.as_bytes())[..12])
    };
    if !dns_label(&value) {
        return Err(invalid("Invalid workload namespace"));
    }
    Ok(value)
}
fn object_map<'a>(
    value: &'a Value,
    what: &'static str,
) -> Result<&'a serde_json::Map<String, Value>> {
    value.as_object().ok_or_else(|| invalid(what))
}
/// A pod template must not reach the node or gain privileges.
fn safe_pod(spec: &Value) -> Result<()> {
    let spec = object_map(spec, "Invalid pod template")?;
    for key in ["hostNetwork", "hostPID", "hostIPC"] {
        if spec.get(key).is_some_and(|v| v != &Value::Bool(false)) {
            return Err(invalid(
                "Workloads cannot use the host network or processes",
            ));
        }
    }
    if spec
        .get("serviceAccountName")
        .is_some_and(|v| v != "default")
        || spec.contains_key("nodeName")
        || spec.get("automountServiceAccountToken") == Some(&Value::Bool(true))
    {
        return Err(invalid("Workloads run without cluster credentials"));
    }
    for volume in spec
        .get("volumes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if volume.get("hostPath").is_some() {
            return Err(invalid("Workloads cannot mount host paths"));
        }
    }
    for list in ["containers", "initContainers", "ephemeralContainers"] {
        for container in spec
            .get(list)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let context = &container["securityContext"];
            let added = context["capabilities"]["add"]
                .as_array()
                .map_or(&[][..], Vec::as_slice);
            if context["privileged"] == true
                || context["allowPrivilegeEscalation"] == true
                || added.iter().any(|c| c != "NET_BIND_SERVICE")
            {
                return Err(invalid("Workloads cannot run privileged"));
            }
        }
    }
    Ok(())
}
/// Checks and pins one unit's objects. Returns them with namespace and owner labels set and
/// service account tokens switched off.
pub fn pin(
    manifest: &Manifest,
    plugin: &str,
    project: &str,
    unit: &str,
    objects: &Value,
) -> Result<(String, Vec<Value>)> {
    if !dns_label(unit) {
        return Err(invalid("Invalid workload unit"));
    }
    let namespace = namespace(plugin, project)?;
    let list = objects
        .as_array()
        .filter(|l| (1..=MAX_OBJECTS).contains(&l.len()))
        .ok_or_else(|| invalid("Send between 1 and 32 objects"))?;
    if serde_json::to_vec(objects)
        .map_err(|_| invalid("Invalid objects"))?
        .len()
        > MAX_BYTES
    {
        return Err(invalid("Workload objects are too large"));
    }
    let mut seen = std::collections::HashSet::new();
    let mut pinned = Vec::with_capacity(list.len());
    for object in list {
        let mut object = object.clone();
        let api = object["apiVersion"].as_str().unwrap_or_default().to_owned();
        let kind = object["kind"].as_str().unwrap_or_default().to_owned();
        if !WORKLOAD_KINDS.contains(&format!("{api}/{kind}").as_str())
            || !manifest.workload_kind(&api, &kind)
        {
            return Err(invalid("Workload kind is not declared"));
        }
        let metadata = object_map(&object["metadata"], "Objects need metadata")?;
        if metadata
            .keys()
            .any(|k| !["name", "labels", "annotations"].contains(&k.as_str()))
        {
            return Err(invalid("Objects set name, labels and annotations only"));
        }
        let name = metadata
            .get("name")
            .and_then(Value::as_str)
            .filter(|n| dns_label(n))
            .ok_or_else(|| invalid("Invalid object name"))?
            .to_owned();
        if !seen.insert(format!("{kind}/{name}")) {
            return Err(invalid("Duplicate object"));
        }
        for key in ["labels", "annotations"] {
            if let Some(map) = metadata.get(key) {
                let map = object_map(map, "Invalid labels")?;
                if map.len() > 32
                    || map
                        .iter()
                        .any(|(k, v)| k.starts_with(OWNER) || k.len() > 128 || !v.is_string())
                {
                    return Err(invalid("Invalid labels or annotations"));
                }
            }
        }
        match kind.as_str() {
            "Deployment" | "StatefulSet" => safe_pod(&object["spec"]["template"]["spec"])?,
            "Certificate" if object["spec"]["isCA"] == true => {
                return Err(invalid("Certificates are for servers, not authorities"));
            }
            "Service"
                if object["spec"]["type"]
                    .as_str()
                    .is_some_and(|t| t != "ClusterIP") =>
            {
                return Err(invalid(
                    "Services stay inside the cluster; publish through a route",
                ));
            }
            _ => {}
        }
        let labels = object["metadata"]["labels"]
            .as_object()
            .cloned()
            .unwrap_or_default();
        let mut labels = labels;
        labels.insert(format!("{OWNER}managed-by"), json!("webdock"));
        labels.insert(format!("{OWNER}plugin"), json!(plugin));
        labels.insert(format!("{OWNER}project-id"), json!(project));
        labels.insert(format!("{OWNER}unit"), json!(unit));
        object["metadata"]["labels"] = Value::Object(labels.clone());
        object["metadata"]["namespace"] = json!(namespace);
        if matches!(kind.as_str(), "Deployment" | "StatefulSet") {
            // Pods carry the owner labels too, so the agent can find them for status.
            let template = &mut object["spec"]["template"];
            let mut pod_labels = template["metadata"]["labels"]
                .as_object()
                .cloned()
                .unwrap_or_default();
            pod_labels.extend(labels);
            template["metadata"]["labels"] = Value::Object(pod_labels);
            template["spec"]["automountServiceAccountToken"] = json!(false);
        }
        pinned.push(object);
    }
    Ok((namespace, pinned))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Apply {
    project: String,
    unit: String,
    objects: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Unit {
    unit: String,
}
impl HostService {
    /// `apply` | `observe` | `remove` for the authenticated plugin runtime.
    pub async fn workloads(
        self: &Arc<Self>,
        peer: &PeerIdentity,
        plugin: &str,
        generation: u64,
        method: &str,
        input: Value,
    ) -> Result<Value> {
        self.runtime_authority(plugin.to_owned(), generation)?
            .authorize_peer(peer)
            .await?;
        let tx = self.controller().await?;
        fence(&tx, false).await?;
        let metadata = self.metadata(&tx, plugin, None).await?;
        let approved = metadata.configuration["approved_capabilities"]
            .as_array()
            .is_some_and(|c| c.contains(&json!("plugin.workloads")));
        if !approved || metadata.manifest.as_json()["workloads"].is_null() {
            return Err(unsupported("Workloads are not approved for this plugin"));
        }
        let binding = self
            .bindings
            .runtime(plugin)
            .await?
            .ok_or_else(|| unsupported("Plugin runtime is not configured"))?;
        let output = match method {
            "apply" => {
                let input: Apply =
                    serde_json::from_value(input).map_err(|_| invalid("Invalid workload"))?;
                let cluster = binding
                    .workload_cluster
                    .clone()
                    .ok_or_else(|| unsupported("No cluster is assigned to this plugin"))?;
                let (namespace, objects) = pin(
                    &metadata.manifest,
                    plugin,
                    &input.project,
                    &input.unit,
                    &input.objects,
                )?;
                let row = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,
                    "INSERT INTO webdock_auth.plugin_workload(plugin_id,unit,project_id,cluster_id,namespace,objects) VALUES($1,$2,$3,$4,$5,$6) \
                     ON CONFLICT (plugin_id,unit) DO UPDATE SET objects=EXCLUDED.objects,removing=false,revision=webdock_auth.plugin_workload.revision+1,updated_at=now() \
                     WHERE webdock_auth.plugin_workload.project_id=EXCLUDED.project_id RETURNING revision",
                    [plugin.into(), input.unit.into(), input.project.into(), cluster.into(), namespace.clone().into(), Value::Array(objects).into()])).await.map_err(db_error)?
                    .ok_or_else(|| conflict("This unit belongs to another project"))?;
                json!({"revision": row.try_get::<i64>("", "revision").map_err(db_error)?, "namespace": namespace})
            }
            "observe" => {
                let input: Unit =
                    serde_json::from_value(input).map_err(|_| invalid("Invalid workload"))?;
                let row = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,
                    "SELECT jsonb_build_object('revision',revision,'appliedRevision',applied_revision,'removing',removing,'observed',observed,'error',error,'observedAt',observed_at,'namespace',namespace) AS value FROM webdock_auth.plugin_workload WHERE plugin_id=$1 AND unit=$2",
                    [plugin.into(), input.unit.into()])).await.map_err(db_error)?;
                match row {
                    Some(row) => row.try_get::<Value>("", "value").map_err(db_error)?,
                    None => json!({"removed": true}),
                }
            }
            "remove" => {
                let input: Unit =
                    serde_json::from_value(input).map_err(|_| invalid("Invalid workload"))?;
                tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,
                    "UPDATE webdock_auth.plugin_workload SET removing=true,objects='[]'::jsonb,revision=revision+1,updated_at=now() WHERE plugin_id=$1 AND unit=$2 AND NOT removing",
                    [plugin.into(), input.unit.into()])).await.map_err(db_error)?;
                json!({})
            }
            _ => return Err(unsupported("Unknown workload method")),
        };
        tx.commit().await.map_err(db_error)?;
        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn manifest() -> Manifest {
        let mut v: Value = serde_json::from_str(include_str!(
            "../../plugin-protocol/tests/fixtures/project-notes.json"
        ))
        .unwrap();
        v["name"] = json!("hosting");
        v["capabilities"] = json!(["plugin.workloads"]);
        v["services"]["required"] = json!([]);
        v["jobs"] = json!([]);
        v["workloads"] = json!({"kinds": ["apps/v1/Deployment", "v1/Service", "v1/Secret", "cert-manager.io/v1/Certificate"]});
        for action in v["actions"].as_array_mut().unwrap() {
            action["capabilities"] = json!([]);
        }
        Manifest::parse(&serde_json::to_vec(&v).unwrap()).unwrap()
    }
    fn deployment(spec: Value) -> Value {
        json!({"apiVersion":"apps/v1","kind":"Deployment","metadata":{"name":"web","labels":{"app":"web"}},
               "spec":{"selector":{"matchLabels":{"app":"web"}},"template":{"metadata":{"labels":{"app":"web"}},"spec":spec}}})
    }
    #[test]
    fn objects_are_pinned_to_the_installation_namespace_with_owner_labels() {
        let objects = json!([deployment(json!({"containers":[{"name":"web","image":"nginx:stable-alpine"}]})),
                             {"apiVersion":"v1","kind":"Service","metadata":{"name":"web"},"spec":{"ports":[{"port":80}]}}]);
        let (namespace, pinned) = pin(&manifest(), "hosting", "201", "app-1", &objects).unwrap();
        assert_eq!(namespace, "wd-hosting-201");
        assert_eq!(pinned[0]["metadata"]["namespace"], "wd-hosting-201");
        assert_eq!(pinned[0]["metadata"]["labels"]["webdock.dev/unit"], "app-1");
        assert_eq!(pinned[0]["metadata"]["labels"]["app"], "web");
        assert_eq!(
            pinned[0]["spec"]["template"]["metadata"]["labels"]["webdock.dev/plugin"],
            "hosting"
        );
        assert_eq!(
            pinned[0]["spec"]["template"]["spec"]["automountServiceAccountToken"],
            false
        );
        assert_eq!(
            pinned[1]["metadata"]["labels"]["webdock.dev/project-id"],
            "201"
        );
    }
    #[test]
    fn certificates_are_for_servers_only() {
        let certificate = |spec: Value| json!([{"apiVersion":"cert-manager.io/v1","kind":"Certificate","metadata":{"name":"web"},"spec":spec}]);
        let server = json!({"secretName":"web-tls","dnsNames":["web.apps.localhost"],"issuerRef":{"name":"webdock-dev-ca","kind":"ClusterIssuer"}});
        assert!(
            pin(
                &manifest(),
                "hosting",
                "201",
                "app-1",
                &certificate(server.clone())
            )
            .is_ok()
        );
        let mut authority = server;
        authority["isCA"] = json!(true);
        assert!(
            pin(
                &manifest(),
                "hosting",
                "201",
                "app-1",
                &certificate(authority)
            )
            .is_err(),
            "no plugin mints a CA"
        );
    }
    #[test]
    fn unsafe_or_undeclared_objects_are_refused() {
        let cases = [
            json!([{"apiVersion":"v1","kind":"Pod","metadata":{"name":"x"}}]),
            json!([{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"x"}}]),
            json!([{"apiVersion":"v1","kind":"Secret","metadata":{"name":"x","namespace":"kube-system"}}]),
            json!([{"apiVersion":"v1","kind":"Secret","metadata":{"name":"x","labels":{"webdock.dev/unit":"other"}}}]),
            json!([{"apiVersion":"v1","kind":"Secret","metadata":{"name":"Bad_Name"}}]),
            json!([{"apiVersion":"v1","kind":"Service","metadata":{"name":"x"},"spec":{"type":"NodePort"}}]),
            json!([deployment(
                json!({"hostNetwork":true,"containers":[{"name":"a","image":"x"}]})
            )]),
            json!([deployment(
                json!({"volumes":[{"name":"h","hostPath":{"path":"/"}}],"containers":[{"name":"a","image":"x"}]})
            )]),
            json!([deployment(
                json!({"containers":[{"name":"a","image":"x","securityContext":{"privileged":true}}]})
            )]),
            json!([deployment(
                json!({"containers":[{"name":"a","image":"x","securityContext":{"capabilities":{"add":["SYS_ADMIN"]}}}]})
            )]),
            json!([deployment(
                json!({"serviceAccountName":"admin","containers":[{"name":"a","image":"x"}]})
            )]),
            json!([{"apiVersion":"v1","kind":"Secret","metadata":{"name":"x"}},{"apiVersion":"v1","kind":"Secret","metadata":{"name":"x"}}]),
            json!([]),
        ];
        for objects in cases {
            assert!(
                pin(&manifest(), "hosting", "201", "app-1", &objects).is_err(),
                "{objects}"
            );
        }
        assert!(
            pin(
                &manifest(),
                "hosting",
                "201",
                "App_1",
                &json!([{"apiVersion":"v1","kind":"Secret","metadata":{"name":"x"}}])
            )
            .is_err()
        );
        assert!(
            pin(
                &manifest(),
                "hosting",
                "20x",
                "app-1",
                &json!([{"apiVersion":"v1","kind":"Secret","metadata":{"name":"x"}}])
            )
            .is_err()
        );
        let long = namespace(&"p".repeat(64), "123456789012345678").unwrap();
        assert!(
            long.len() <= 63 && long.starts_with("wd-") && long.ends_with("-123456789012345678"),
            "{long}"
        );
    }
}
