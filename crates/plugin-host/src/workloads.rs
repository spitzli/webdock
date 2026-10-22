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
use webdock_plugin_protocol::{MIB, MILLI, quantity};
/// Memory (limit) and CPU (request, or the limit Kubernetes would default it to) one container or
/// one CloudNativePG instance takes. Both must be stated.
fn resources(resources: &Value) -> Result<(u64, u64)> {
    let memory = quantity(&resources["limits"]["memory"], MIB)
        .ok_or_else(|| invalid("Every container states a memory limit"))?;
    let cpu = quantity(&resources["requests"]["cpu"], MILLI)
        .or_else(|| quantity(&resources["limits"]["cpu"], MILLI))
        .ok_or_else(|| invalid("Every container states a CPU request"))?;
    Ok((memory, cpu))
}
/// Containers run side by side; init containers one after another before them.
fn pod(spec: &Value) -> Result<(u64, u64)> {
    let (mut memory, mut cpu, mut init_memory, mut init_cpu) = (0u64, 0u64, 0u64, 0u64);
    for container in spec["containers"].as_array().into_iter().flatten() {
        let (m, c) = resources(&container["resources"])?;
        memory = memory.saturating_add(m);
        cpu = cpu.saturating_add(c);
    }
    for container in spec["initContainers"].as_array().into_iter().flatten() {
        let (m, c) = resources(&container["resources"])?;
        init_memory = init_memory.max(m);
        init_cpu = init_cpu.max(c);
    }
    Ok((memory.max(init_memory), cpu.max(init_cpu)))
}
fn storage(value: &Value) -> Result<u64> {
    quantity(value, MIB).ok_or_else(|| invalid("Every volume states its size"))
}
/// What one unit's objects take from the customer's plan: memory and storage in MiB, CPU in
/// millicores. Stopped workloads keep their storage.
pub fn allocation(objects: &[Value]) -> Result<Value> {
    let (mut memory, mut cpu, mut disk) = (0u64, 0u64, 0u64);
    for object in objects {
        let spec = &object["spec"];
        let count = |key: &str| spec[key].as_u64().unwrap_or(1);
        match object["kind"].as_str().unwrap_or_default() {
            kind @ ("Deployment" | "StatefulSet") => {
                let replicas = count("replicas");
                let (m, c) = pod(&spec["template"]["spec"])?;
                memory = memory.saturating_add(m.saturating_mul(replicas));
                cpu = cpu.saturating_add(c.saturating_mul(replicas));
                if kind == "StatefulSet" {
                    for claim in spec["volumeClaimTemplates"]
                        .as_array()
                        .into_iter()
                        .flatten()
                    {
                        let size = storage(&claim["spec"]["resources"]["requests"]["storage"])?;
                        disk = disk.saturating_add(size.saturating_mul(replicas.max(1)));
                    }
                }
            }
            "PersistentVolumeClaim" => {
                disk = disk.saturating_add(storage(&spec["resources"]["requests"]["storage"])?);
            }
            "Cluster" if object["apiVersion"] == "postgresql.cnpg.io/v1" => {
                let instances = count("instances");
                let (m, c) = resources(&spec["resources"])?;
                let mut size = storage(&spec["storage"]["size"])?;
                if !spec["walStorage"].is_null() {
                    size = size.saturating_add(storage(&spec["walStorage"]["size"])?);
                }
                memory = memory.saturating_add(m.saturating_mul(instances));
                cpu = cpu.saturating_add(c.saturating_mul(instances));
                disk = disk.saturating_add(size.saturating_mul(instances));
            }
            _ => {}
        }
    }
    Ok(json!({"memory": memory, "cpu": cpu, "storage": disk}))
}
/// Checks and pins one unit's objects. Returns them with namespace and owner labels set and
/// service account tokens switched off, and what they allocate.
pub fn pin(
    manifest: &Manifest,
    plugin: &str,
    project: &str,
    unit: &str,
    objects: &Value,
) -> Result<(String, Vec<Value>, Value)> {
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
    let allocation = allocation(&pinned)?;
    Ok((namespace, pinned, allocation))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Apply {
    project: String,
    unit: String,
    objects: Value,
    /// The plugin resource this unit belongs to, so usage can show its name.
    #[serde(default)]
    resource: Option<String>,
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
                let (namespace, objects, allocation) = pin(
                    &metadata.manifest,
                    plugin,
                    &input.project,
                    &input.unit,
                    &input.objects,
                )?;
                if input.resource.as_deref().is_some_and(|r| {
                    !(1..=128).contains(&r.len())
                        || !r
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
                }) {
                    return Err(invalid("Invalid resource"));
                }
                let checked = super::limits::checked(&tx, &input.project).await?;
                let previous = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,
                    "SELECT allocation FROM webdock_auth.plugin_workload WHERE plugin_id=$1 AND unit=$2 AND project_id=$3",
                    [plugin.into(), input.unit.clone().into(), input.project.clone().into()])).await.map_err(db_error)?
                    .map(|r| r.try_get::<Value>("", "allocation")).transpose().map_err(db_error)?
                    .unwrap_or_else(|| json!({}));
                if let Some(message) = super::limits::exceeded(&checked, &previous, &allocation) {
                    return Err(conflict(&message));
                }
                let row = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,
                    "INSERT INTO webdock_auth.plugin_workload(plugin_id,unit,project_id,cluster_id,namespace,objects,allocation,resource_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) \
                     ON CONFLICT (plugin_id,unit) DO UPDATE SET objects=EXCLUDED.objects,allocation=EXCLUDED.allocation,resource_id=EXCLUDED.resource_id,removing=false,revision=webdock_auth.plugin_workload.revision+1,updated_at=now() \
                     WHERE webdock_auth.plugin_workload.project_id=EXCLUDED.project_id RETURNING revision",
                    [plugin.into(), input.unit.into(), input.project.into(), cluster.into(), namespace.clone().into(), Value::Array(objects).into(), allocation.into(), input.resource.into()])).await.map_err(db_error)?
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
                    "UPDATE webdock_auth.plugin_workload SET removing=true,objects='[]'::jsonb,allocation='{}'::jsonb,revision=revision+1,updated_at=now() WHERE plugin_id=$1 AND unit=$2 AND NOT removing",
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
        v["workloads"] = json!({"kinds": ["apps/v1/Deployment", "v1/Service", "v1/Secret", "cert-manager.io/v1/Certificate", "postgresql.cnpg.io/v1/Cluster"]});
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
        let objects = json!([deployment(json!({"containers":[{"name":"web","image":"nginx:stable-alpine","resources":sized()}]})),
                             {"apiVersion":"v1","kind":"Service","metadata":{"name":"web"},"spec":{"ports":[{"port":80}]}}]);
        let (namespace, pinned, _) = pin(&manifest(), "hosting", "201", "app-1", &objects).unwrap();
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
    fn sized() -> Value {
        json!({"limits":{"memory":"256Mi"},"requests":{"memory":"256Mi","cpu":"50m"}})
    }
    #[test]
    fn allocation_counts_replicas_instances_and_volumes() {
        let pods = json!({"replicas":2,"template":{"spec":{
            "initContainers":[{"name":"i","resources":{"limits":{"memory":"1Gi"},"requests":{"cpu":"1"}}}],
            "containers":[{"name":"a","resources":sized()},{"name":"b","resources":{"limits":{"memory":"128Mi","cpu":"200m"}}}]}}});
        let mut stopped = json!({"apiVersion":"apps/v1","kind":"Deployment","spec":pods.clone()});
        stopped["spec"]["replicas"] = json!(0);
        let mut set = json!({"apiVersion":"apps/v1","kind":"StatefulSet","spec":pods.clone()});
        set["spec"]["volumeClaimTemplates"] =
            json!([{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}]);
        let cases = [
            // Init containers run before the others: 1 GiB and one core outweigh 384 MiB and 250m.
            (
                json!([{"apiVersion":"apps/v1","kind":"Deployment","spec":pods}]),
                json!({"memory":2048,"cpu":2000,"storage":0}),
            ),
            (json!([stopped]), json!({"memory":0,"cpu":0,"storage":0})),
            (
                json!([set]),
                json!({"memory":2048,"cpu":2000,"storage":4096}),
            ),
            (
                json!([{"apiVersion":"v1","kind":"PersistentVolumeClaim","spec":{"resources":{"requests":{"storage":"2Gi"}}}}]),
                json!({"memory":0,"cpu":0,"storage":2048}),
            ),
            (
                json!([{"apiVersion":"postgresql.cnpg.io/v1","kind":"Cluster","spec":{"instances":2,"storage":{"size":"1Gi"},"walStorage":{"size":"512Mi"},
                "resources":{"limits":{"memory":"512Mi"},"requests":{"memory":"512Mi","cpu":"100m"}}}}]),
                json!({"memory":1024,"cpu":200,"storage":3072}),
            ),
            (
                json!([{"apiVersion":"v1","kind":"Secret"},{"apiVersion":"v1","kind":"Service"}]),
                json!({"memory":0,"cpu":0,"storage":0}),
            ),
        ];
        for (objects, expected) in cases {
            assert_eq!(
                allocation(objects.as_array().unwrap()).unwrap(),
                expected,
                "{objects}"
            );
        }
    }
    #[test]
    fn workloads_state_memory_cpu_and_volume_sizes() {
        let cases = [
            deployment(json!({"containers":[{"name":"a","image":"x"}]})),
            deployment(
                json!({"containers":[{"name":"a","image":"x","resources":{"limits":{"memory":"256Mi"}}}]}),
            ),
            deployment(
                json!({"containers":[{"name":"a","image":"x","resources":{"requests":{"cpu":"50m","memory":"256Mi"}}}]}),
            ),
            deployment(
                json!({"initContainers":[{"name":"i","image":"x"}],"containers":[{"name":"a","image":"x","resources":sized()}]}),
            ),
            json!({"apiVersion":"postgresql.cnpg.io/v1","kind":"Cluster","metadata":{"name":"db"},"spec":{"instances":1,"resources":{"limits":{"memory":"512Mi"},"requests":{"cpu":"100m"}}}}),
        ];
        for object in cases {
            assert!(
                pin(&manifest(), "hosting", "201", "app-1", &json!([object])).is_err(),
                "{object}"
            );
        }
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
