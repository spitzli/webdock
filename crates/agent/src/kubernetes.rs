mod completed;
mod lifecycle;
mod metrics;
use k8s_openapi::api::{
    apps::v1::Deployment,
    core::v1::{Namespace, Node, Pod, Secret},
};
use kube::{
    Api, Client, Config,
    api::{ApiResource, DynamicObject, GroupVersionKind, ListParams, LogParams, PostParams},
    config::{KubeConfigOptions, Kubeconfig},
};
pub use lifecycle::verify_retirement_manifest;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use webdock_supervisor::*;

pub fn helm_values(spec: &RuntimeSpec, generation: u64, stop: bool) -> Result<Value> {
    spec.validate()?;
    if spec.hosting_binding.is_some() {
        return Err(ExecutionError::Unsupported(
            "retained hosting uses its existing deployment",
        ));
    }
    if spec.volume.as_ref().is_some_and(|v| v.size_bytes.is_none()) {
        return Err(ExecutionError::Unsupported(
            "Kubernetes volume capacity must be explicit",
        ));
    }
    let limits = json!({"cpu":format!("{}m",spec.cpu_millicores),"memory":spec.memory_bytes.to_string(),"ephemeral-storage":spec.ephemeral_bytes.to_string()});
    Ok(
        json!({"name":spec.name(),"labels":spec.labels(),"revision":spec.revision,"generation":generation,"specHash":digest(spec)?,"image":spec.image,"arguments":spec.arguments,"replicas":if stop{0}else{spec.replicas},"port":spec.port,"healthPath":spec.health_path,"ephemeralBytes":spec.ephemeral_bytes,"resources":{"requests":limits,"limits":limits},"volume":{"enabled":spec.volume.is_some(),"sizeBytes":spec.volume.as_ref().and_then(|v|v.size_bytes).unwrap_or(0)},"plugin":spec.plugin,"mounts":spec.mounts.iter().map(|m|json!({"name":m.name,"secretName":crate::policy::RuntimePolicy::kubernetes_secret_name(spec,&m.name)})).collect::<Vec<_>>()}),
    )
}
#[derive(Clone)]
pub struct ApprovedChart {
    path: PathBuf,
    digest: String,
}
impl ApprovedChart {
    pub fn verify(path: impl AsRef<Path>, expected_sha256: &str) -> Result<Self> {
        let path = path.as_ref();
        if !path.is_absolute()
            || expected_sha256.len() != 64
            || !expected_sha256
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            || std::fs::canonicalize(path).map_err(|_| ExecutionError::Invalid("chart path"))?
                != path
            || !path.join("Chart.yaml").is_file()
        {
            return Err(ExecutionError::Invalid("approved chart"));
        }
        if Self::digest(path)? != expected_sha256 {
            return Err(ExecutionError::Ownership);
        }
        Ok(Self {
            path: path.into(),
            digest: expected_sha256.into(),
        })
    }
    /// Hash reviewed chart files, including relative names. Symlinks and large trees are refused.
    pub fn digest(path: impl AsRef<Path>) -> Result<String> {
        fn visit(
            base: &Path,
            path: &Path,
            files: &mut Vec<PathBuf>,
            bytes: &mut u64,
        ) -> Result<()> {
            for entry in
                std::fs::read_dir(path).map_err(|_| ExecutionError::Invalid("chart directory"))?
            {
                let entry = entry.map_err(|_| ExecutionError::Invalid("chart entry"))?;
                let metadata = std::fs::symlink_metadata(entry.path())
                    .map_err(|_| ExecutionError::Invalid("chart metadata"))?;
                if metadata.file_type().is_symlink() {
                    return Err(ExecutionError::Invalid("chart symlink"));
                }
                if metadata.is_dir() {
                    visit(base, &entry.path(), files, bytes)?;
                } else if metadata.is_file() {
                    *bytes += metadata.len();
                    if *bytes > 1024 * 1024 || files.len() >= 128 {
                        return Err(ExecutionError::Invalid("chart limit"));
                    }
                    files.push(
                        entry
                            .path()
                            .strip_prefix(base)
                            .map_err(|_| ExecutionError::Invalid("chart path"))?
                            .into(),
                    );
                } else {
                    return Err(ExecutionError::Invalid("chart file"));
                }
            }
            Ok(())
        }
        let path = path.as_ref();
        let mut files = Vec::new();
        visit(path, path, &mut files, &mut 0)?;
        files.sort();
        let mut digest = Sha256::new();
        for relative in files {
            let name = relative
                .to_str()
                .ok_or(ExecutionError::Invalid("chart filename"))?;
            digest.update((name.len() as u64).to_be_bytes());
            digest.update(name.as_bytes());
            let bytes = std::fs::read(path.join(relative))
                .map_err(|_| ExecutionError::Invalid("chart file"))?;
            digest.update((bytes.len() as u64).to_be_bytes());
            digest.update(bytes);
        }
        Ok(format!("{:x}", digest.finalize()))
    }
}
#[derive(Clone)]
pub struct KubernetesAdapter {
    client: Client,
    installation: String,
    kubeconfig: PathBuf,
    context: String,
    helm: PathBuf,
    chart: ApprovedChart,
    policy: Arc<crate::policy::RuntimePolicy>,
    storage: Option<(crate::storage::StorageClient, crate::storage::StorageConfig)>,
}
impl KubernetesAdapter {
    pub(crate) fn database_client(&self) -> Client {
        self.client.clone()
    }
    pub(crate) fn mail_runtime(
        &self,
        path: PathBuf,
    ) -> Result<crate::mail::kubernetes::KubernetesMailRuntime> {
        let storage = self.storage.clone().ok_or(ExecutionError::Unsupported(
            "Mail requires verified node-local storage",
        ))?;
        let runtime = crate::mail::kubernetes::KubernetesMailRuntime::open(
            self.client.clone(),
            storage,
            path,
        )?;
        if runtime.installation() != self.installation {
            return Err(ExecutionError::Ownership);
        }
        Ok(runtime)
    }
    /// Only an explicit kubeconfig and named context; never infer the workstation's default context.
    pub async fn connect(
        kubeconfig: PathBuf,
        context: String,
        installation: String,
        helm: PathBuf,
        chart: ApprovedChart,
    ) -> Result<Self> {
        if !kubeconfig.is_absolute()
            || context.is_empty()
            || context.len() > 128
            || context.starts_with('-')
            || !helm.is_absolute()
            || !helm.is_file()
        {
            return Err(ExecutionError::Invalid("explicit Kubernetes configuration"));
        }
        let kubeconfig = std::fs::canonicalize(kubeconfig)
            .map_err(|_| ExecutionError::Invalid("kubeconfig path"))?;
        let config_file = Kubeconfig::read_from(&kubeconfig)
            .map_err(|_| ExecutionError::Invalid("kubeconfig"))?;
        if config_file
            .auth_infos
            .iter()
            .filter_map(|v| v.auth_info.as_ref())
            .any(|auth| auth.exec.is_some())
        {
            return Err(ExecutionError::Unsupported(
                "Kubeconfig executable credentials",
            ));
        }
        let config = Config::from_custom_kubeconfig(
            config_file,
            &KubeConfigOptions {
                context: Some(context.clone()),
                ..Default::default()
            },
        )
        .await
        .map_err(|_| ExecutionError::Invalid("Kubernetes context"))?;
        if config.accept_invalid_certs || config.cluster_url.scheme_str() != Some("https") {
            return Err(ExecutionError::Invalid("Verified Kubernetes TLS required"));
        }
        let client = Client::try_from(config).map_err(|_| ExecutionError::Runtime)?;
        Ok(Self {
            client,
            installation,
            kubeconfig,
            context,
            helm,
            chart,
            policy: Arc::new(crate::policy::RuntimePolicy::default()),
            storage: None,
        })
    }
    pub fn with_policy(mut self, policy: Arc<crate::policy::RuntimePolicy>) -> Self {
        self.policy = policy;
        self
    }
    pub async fn with_storage_socket(mut self, socket: PathBuf) -> Result<Self> {
        let helper = crate::storage::StorageClient::new(socket);
        let config = helper.information().await?;
        let nodes: Api<k8s_openapi::api::core::v1::Node> = Api::all(self.client.clone());
        let nodes = nodes
            .list(&ListParams::default().limit(201))
            .await
            .map_err(|_| ExecutionError::Runtime)?;
        if nodes.metadata.continue_.is_some_and(|s| !s.is_empty())
            || nodes.items.len() != 1
            || nodes.items[0].metadata.name.as_deref() != Some(config.node.as_str())
        {
            return Err(ExecutionError::Unsupported(
                "single-node local storage binding",
            ));
        }
        let capacity = helper
            .capability(std::slice::from_ref(&config.node))
            .await?;
        if !capacity.ready || capacity.capacity_bytes != config.capacity_bytes {
            return Err(ExecutionError::Runtime);
        }
        self.storage = Some((helper, config));
        Ok(self)
    }
    async fn checked_registry_secret(
        &self,
        namespace: &str,
        name: &str,
        authority: &str,
    ) -> Result<()> {
        let api: Api<Secret> = Api::namespaced(self.client.clone(), namespace);
        let secret = api.get(name).await.map_err(|_| ExecutionError::Denied)?;
        if secret.type_.as_deref() != Some("kubernetes.io/dockerconfigjson") {
            return Err(ExecutionError::Ownership);
        }
        let data = secret.data.ok_or(ExecutionError::Ownership)?;
        if data.len() != 1 {
            return Err(ExecutionError::Ownership);
        }
        crate::registry::RegistryCredential::parse(
            &data
                .get(".dockerconfigjson")
                .ok_or(ExecutionError::Ownership)?
                .0,
            authority,
        )?;
        Ok(())
    }
    async fn registry_selection(
        &self,
        spec: &RuntimeSpec,
    ) -> Result<crate::registry::PullSelection> {
        let Some(registry) = self.policy.registry()? else {
            return Ok(crate::registry::PullSelection::Unconfigured);
        };
        let Some(grant) = registry.select(spec.project_id.as_str(), &spec.image)? else {
            return Ok(crate::registry::PullSelection::Anonymous);
        };
        let name = grant
            .pull_secret
            .as_ref()
            .ok_or(ExecutionError::Unsupported(
                "Kubernetes registry pull secret",
            ))?;
        let namespace = if spec.hosting_binding.is_some() {
            crate::legacy::namespace(spec)
        } else {
            spec.namespace()
        };
        self.checked_registry_secret(
            &namespace,
            name,
            spec.image
                .split('/')
                .next()
                .ok_or(ExecutionError::Ownership)?,
        )
        .await?;
        Ok(crate::registry::PullSelection::Secret(name.clone()))
    }
    async fn registry_ready(&self) -> Result<bool> {
        let Some(registry) = self.policy.registry()? else {
            return Ok(false);
        };
        for (project, grant) in &registry.projects {
            let name = grant
                .pull_secret
                .as_ref()
                .ok_or(ExecutionError::Ownership)?;
            let authority = grant
                .repository
                .split('/')
                .next()
                .ok_or(ExecutionError::Ownership)?;
            for namespace in [format!("wd-{project}"), format!("wdv-{project}")] {
                self.checked_registry_secret(&namespace, name, authority)
                    .await?;
            }
        }
        Ok(true)
    }
    async fn verify_mounts(&self, spec: &RuntimeSpec) -> Result<()> {
        for reference in &spec.mounts {
            let grant = self.policy.grant(spec, reference)?;
            match &grant.kind {
                crate::policy::GrantKind::SocketDirectory {} => {
                    return Err(ExecutionError::Unsupported(
                        "Kubernetes uses network plugin transport",
                    ));
                }
                crate::policy::GrantKind::Secret { sha256 } => {
                    let api: Api<Secret> = Api::namespaced(self.client.clone(), &spec.namespace());
                    let secret = api
                        .get(&crate::policy::RuntimePolicy::kubernetes_secret_name(
                            spec,
                            &grant.name,
                        ))
                        .await
                        .map_err(|_| ExecutionError::Denied)?;
                    spec.check_owner(&secret.metadata.labels.unwrap_or_default())?;
                    let data = secret.data.ok_or(ExecutionError::Denied)?;
                    if data.len() != 1
                        || data.get("value").is_none_or(|v| {
                            v.0.len() > 65536 || format!("{:x}", Sha256::digest(&v.0)) != *sha256
                        })
                    {
                        return Err(ExecutionError::Ownership);
                    }
                }
            }
        }
        Ok(())
    }
    fn validate(&self, spec: &RuntimeSpec) -> Result<()> {
        spec.validate()?;
        if spec.installation != self.installation {
            return Err(ExecutionError::Ownership);
        }
        Ok(())
    }
    async fn deployment(&self, spec: &RuntimeSpec) -> Result<Option<Deployment>> {
        let api: Api<Deployment> = Api::namespaced(self.client.clone(), &spec.namespace());
        let deployment = api
            .get_opt(&spec.name())
            .await
            .map_err(|_| ExecutionError::Runtime)?;
        if let Some(d) = &deployment {
            spec.check_owner(&d.metadata.labels.clone().unwrap_or_default())?;
        }
        Ok(deployment)
    }
    async fn namespace(&self, spec: &RuntimeSpec, guard: &LeaseGuard) -> Result<()> {
        let api: Api<Namespace> = Api::all(self.client.clone());
        if let Some(existing) = api
            .get_opt(&spec.namespace())
            .await
            .map_err(|_| ExecutionError::Runtime)?
        {
            spec.check_owner(&existing.metadata.labels.unwrap_or_default())?;
            return Ok(());
        }
        let mut labels = spec.labels();
        labels.insert(
            "pod-security.kubernetes.io/enforce".into(),
            "restricted".into(),
        );
        let namespace:Namespace=serde_json::from_value(json!({"apiVersion":"v1","kind":"Namespace","metadata":{"name":spec.namespace(),"labels":labels}})).map_err(|_|ExecutionError::Invalid("namespace"))?;
        guard.check().await?;
        api.create(&PostParams::default(), &namespace)
            .await
            .map_err(|_| ExecutionError::Runtime)?;
        Ok(())
    }
    async fn check_release_ownership(&self, spec: &RuntimeSpec, generation: u64) -> Result<()> {
        for (group, version, kind, name) in [
            ("apps", "v1", "Deployment", spec.name()),
            ("", "v1", "Service", spec.name()),
            ("", "v1", "ServiceAccount", spec.name()),
            (
                "",
                "v1",
                "PersistentVolumeClaim",
                format!("{}-data", spec.name()),
            ),
            ("networking.k8s.io", "v1", "NetworkPolicy", spec.name()),
        ] {
            let resource = ApiResource::from_gvk(&GroupVersionKind::gvk(group, version, kind));
            let api: Api<DynamicObject> =
                Api::namespaced_with(self.client.clone(), &spec.namespace(), &resource);
            if let Some(existing) = api
                .get_opt(&name)
                .await
                .map_err(|_| ExecutionError::Runtime)?
            {
                spec.check_owner(&existing.metadata.labels.unwrap_or_default())?;
                if kind == "Deployment" {
                    let annotations = existing.metadata.annotations.unwrap_or_default();
                    let actual = annotations
                        .get("webdock.dev/generation")
                        .and_then(|v| v.parse::<u64>().ok())
                        .ok_or(ExecutionError::Ownership)?;
                    let revision = annotations
                        .get("webdock.dev/revision")
                        .and_then(|v| v.parse::<u64>().ok())
                        .ok_or(ExecutionError::Ownership)?;
                    if (revision, actual) > (spec.revision, generation) {
                        return Err(ExecutionError::Fenced);
                    }
                }
            }
        }
        Ok(())
    }
    async fn upgrade(&self, command: &Command, guard: &LeaseGuard) -> Result<()> {
        let _ = ApprovedChart::verify(&self.chart.path, &self.chart.digest)?;
        let mut values = if command.action == Action::Stop {
            let manifest = self
                .helm_read(&command.spec, &["get", "manifest"], guard)
                .await?;
            verify_retirement_manifest(&command.spec, &manifest)?;
            let bytes = self
                .helm_read(&command.spec, &["get", "values", "--output", "json"], guard)
                .await?;
            let values: Value =
                serde_json::from_slice(&bytes).map_err(|_| ExecutionError::Ownership)?;
            if values["name"] != command.spec.name()
                || values["labels"]
                    != serde_json::to_value(command.spec.labels())
                        .map_err(|_| ExecutionError::Ownership)?
            {
                return Err(ExecutionError::Ownership);
            }
            values
        } else {
            let mut values = helm_values(&command.spec, command.generation, false)?;
            values["imagePullSecrets"] = match self.registry_selection(&command.spec).await? {
                crate::registry::PullSelection::Secret(name) => json!([name]),
                _ => json!([]),
            };
            values
        };
        if command.action == Action::Stop {
            // Stop retains the last installed configuration even after artifact/secret/registry grants are revoked.
            values["replicas"] = json!(0);
            values["revision"] = json!(command.spec.revision);
            values["generation"] = json!(command.generation);
        }
        let mut file = tempfile::NamedTempFile::new().map_err(|_| ExecutionError::Runtime)?;
        file.write_all(&serde_json::to_vec(&values).map_err(|_| ExecutionError::Runtime)?)
            .map_err(|_| ExecutionError::Runtime)?;
        file.flush().map_err(|_| ExecutionError::Runtime)?;
        guard.check().await?;
        // Fixed executable and arguments, no shell, hooks, plugin-provided chart or arbitrary YAML.
        let status = tokio::process::Command::new(&self.helm)
            .arg("upgrade")
            .arg("--install")
            .arg(command.spec.name())
            .arg(&self.chart.path)
            .arg("--namespace")
            .arg(command.spec.namespace())
            .arg("--kubeconfig")
            .arg(&self.kubeconfig)
            .arg("--kube-context")
            .arg(&self.context)
            .arg("--values")
            .arg(file.path())
            .args([
                "--wait",
                "--timeout",
                "120s",
                "--history-max",
                "10",
                "--skip-crds",
                "--no-hooks",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status()
            .await
            .map_err(|_| ExecutionError::Runtime)?;
        guard.check().await?;
        if !status.success() {
            return Err(ExecutionError::Runtime);
        }
        Ok(())
    }
}
#[async_trait::async_trait]
impl RuntimeAdapter for KubernetesAdapter {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            retained_volumes: true,
            volume_quotas: false,
            health: true,
            logs: true,
            metrics: true,
            replicas: true,
            upgrades: true,
            ..Capabilities::default()
        }
    }
    async fn target_observation(&self) -> Result<Option<TargetObservation>> {
        let api: Api<Node> = Api::all(self.client.clone());
        let list = api
            .list(&ListParams::default().limit(201))
            .await
            .map_err(|_| ExecutionError::Runtime)?;
        if list.items.is_empty()
            || list.items.len() > 200
            || list
                .metadata
                .continue_
                .is_some_and(|value| !value.is_empty())
        {
            return Err(ExecutionError::Runtime);
        }
        let mut nodes = Vec::new();
        let mut versions = std::collections::BTreeSet::new();
        for node in list.items {
            let status = node.status.ok_or(ExecutionError::Runtime)?;
            if !status
                .conditions
                .unwrap_or_default()
                .iter()
                .any(|c| c.type_ == "Ready" && c.status == "True")
            {
                return Err(ExecutionError::Runtime);
            }
            let info = status.node_info.ok_or(ExecutionError::Runtime)?;
            if !["amd64", "arm64"].contains(&info.architecture.as_str()) {
                return Err(ExecutionError::Unsupported("node architecture"));
            }
            versions.insert(info.kubelet_version);
            let allocatable = status.allocatable.ok_or(ExecutionError::Runtime)?;
            let cpu = parse_quantity(
                &allocatable.get("cpu").ok_or(ExecutionError::Runtime)?.0,
                true,
            )?;
            let memory = parse_quantity(
                &allocatable.get("memory").ok_or(ExecutionError::Runtime)?.0,
                false,
            )?;
            let id = node
                .metadata
                .name
                .filter(|n| !n.is_empty() && n.len() <= 160)
                .ok_or(ExecutionError::Runtime)?;
            let role = if node
                .metadata
                .labels
                .unwrap_or_default()
                .contains_key("node-role.kubernetes.io/control-plane")
            {
                "server"
            } else {
                "agent"
            };
            nodes.push(TargetNode {
                id,
                role: role.into(),
                architecture: info.architecture,
                cpu_millicores: cpu,
                memory_bytes: memory,
            });
        }
        let version = versions.into_iter().collect::<Vec<_>>().join(", ");
        if version.len() > 160 {
            return Err(ExecutionError::Runtime);
        }
        let storage = if let Some((helper, config)) = &self.storage {
            let actual = helper.information().await;
            let capability = if actual.as_ref().is_ok_and(|actual| actual == config) {
                helper
                    .capability(&nodes.iter().map(|n| n.id.clone()).collect::<Vec<_>>())
                    .await
                    .ok()
            } else {
                None
            };
            Some(StorageCapacity {
                capacity_bytes: capability
                    .as_ref()
                    .filter(|v| v.ready)
                    .map_or(0, |v| v.capacity_bytes),
                ready: capability.is_some_and(|v| v.ready),
            })
        } else {
            None
        };
        Ok(Some(TargetObservation {
            storage,
            environment: true,
            registry_version: self.registry_ready().await.unwrap_or(false).then_some(1),
            service_bindings_version: Some(1),
            version,
            nodes,
            runtime_kind: "kubernetes".into(),
        }))
    }
    async fn reconcile(&self, command: &Command, guard: &LeaseGuard) -> Result<ObservedState> {
        if command.action == Action::Apply
            && command.spec.hosting_binding.is_none()
            && command
                .spec
                .hosted_access
                .as_ref()
                .is_some_and(|a| a.service_bindings.is_some())
        {
            return Err(ExecutionError::Unsupported("service binding application"));
        }
        let spec = &command.spec;
        self.validate(spec)?;
        if command.action == Action::Apply {
            self.policy.admit(spec)?;
        }
        if spec.hosting_binding.is_some() {
            let registry = if command.action == Action::Apply {
                self.registry_selection(spec).await?
            } else {
                crate::registry::PullSelection::Unconfigured
            };
            return crate::legacy::reconcile_with_registry(
                self.client.clone(),
                command,
                guard,
                self.storage.as_ref(),
                registry,
            )
            .await;
        }
        if command.action == Action::Retire {
            return self.retire_release(command, guard).await;
        }
        if command.action == Action::PurgeStorage {
            return self.purge_release_storage(command, guard).await;
        }
        helm_values(spec, command.generation, command.action == Action::Stop)?;
        guard.check_for(command).await?;
        self.check_expected(command).await?;
        if command.action == Action::Stop && self.deployment(spec).await?.is_none() {
            return self.inspect(spec).await;
        }
        self.namespace(spec, guard).await?;
        self.check_release_ownership(spec, command.generation)
            .await?;
        // Helm owns specification; the Deployment controller owns Pods and restart behavior.
        guard.check().await?;
        if command.action == Action::Apply {
            self.verify_mounts(spec).await?;
        }
        self.upgrade(command, guard).await?;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(120);
        loop {
            guard.check_for(command).await?;
            let observed = self.inspect(spec).await?;
            if ((command.action == Action::Stop || spec.replicas == 0)
                && observed.phase == Phase::Stopped)
                || (command.action == Action::Apply && spec.replicas > 0 && observed.ready)
            {
                return Ok(observed);
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(ExecutionError::Runtime);
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
    }
    async fn inspect_completed(
        &self,
        command: &Command,
        guard: &LeaseGuard,
    ) -> Result<ObservedState> {
        command.validate()?;
        self.validate(&command.spec)?;
        guard.check_for(command).await?;
        let observed = match command.action {
            Action::Retire | Action::PurgeStorage if command.spec.hosting_binding.is_some() => {
                crate::legacy::inspect_completed(
                    self.client.clone(),
                    command,
                    guard,
                    self.storage.as_ref(),
                )
                .await?
            }
            Action::Retire | Action::PurgeStorage => {
                self.inspect_retirement(command, guard).await?
            }
            Action::Apply | Action::Stop => {
                self.check_expected(command).await?;
                self.inspect(&command.spec).await?
            }
        };
        guard.check_for(command).await?;
        Ok(observed)
    }
    async fn inspect(&self, spec: &RuntimeSpec) -> Result<ObservedState> {
        self.validate(spec)?;
        if spec.hosting_binding.is_some() {
            return crate::legacy::inspect(self.client.clone(), spec).await;
        }
        let mut observed = ObservedState {
            resource_id: spec.resource_id.to_string(),
            revision: spec.revision,
            phase: Phase::Absent,
            ready: false,
            observed_at: timestamp()?,
            runtime_id: None,
            conditions: vec![],
            storage: None,
        };
        let Some(deployment) = self.deployment(spec).await? else {
            return Ok(observed);
        };
        observed.runtime_id = deployment.metadata.uid;
        observed.revision = deployment
            .metadata
            .annotations
            .as_ref()
            .and_then(|a| a.get("webdock.dev/revision"))
            .and_then(|v| v.parse().ok())
            .ok_or(ExecutionError::Ownership)?;
        let desired = deployment
            .spec
            .as_ref()
            .and_then(|s| s.replicas)
            .unwrap_or(1);
        let status = deployment.status.unwrap_or_default();
        let observed_generation =
            status.observed_generation.unwrap_or(0) >= deployment.metadata.generation.unwrap_or(1);
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), &spec.namespace());
        let selector = spec
            .labels()
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join(",");
        let pods = pods
            .list(&ListParams::default().labels(&selector).limit(201))
            .await
            .map_err(|_| ExecutionError::Runtime)?;
        let complete = pods.metadata.continue_.is_none_or(|v| v.is_empty());
        let stopped = desired == 0
            && status.replicas.unwrap_or(0) == 0
            && observed_generation
            && complete
            && pods.items.is_empty();
        observed.ready = desired > 0
            && observed_generation
            && status.updated_replicas == Some(desired)
            && status.available_replicas == Some(desired)
            && complete
            && pods.items.len() == desired as usize
            && pods.items.iter().all(|p| {
                p.metadata.deletion_timestamp.is_none()
                    && p.status
                        .as_ref()
                        .and_then(|s| s.conditions.as_ref())
                        .is_some_and(|c| c.iter().any(|c| c.type_ == "Ready" && c.status == "True"))
            });
        observed.phase = if stopped {
            Phase::Stopped
        } else if observed.ready {
            Phase::Running
        } else {
            Phase::Starting
        };
        observed.conditions.push(Condition {
            kind: "Ready".into(),
            satisfied: observed.ready,
            reason: if stopped {
                "DeploymentSuspended"
            } else if observed.ready {
                "DeploymentAvailable"
            } else {
                "DeploymentProgressing"
            }
            .into(),
        });
        Ok(observed)
    }
    async fn metrics(&self, spec: &RuntimeSpec) -> Result<ResourceMetrics> {
        self.resource_metrics(spec).await
    }
    async fn logs(&self, spec: &RuntimeSpec, tail: u32) -> Result<String> {
        self.validate(spec)?;
        if spec.hosting_binding.is_some() {
            return crate::legacy::logs(self.client.clone(), spec, tail).await;
        }
        if tail == 0 || tail > 1000 {
            return Err(ExecutionError::Invalid("log tail"));
        }
        let api: Api<Pod> = Api::namespaced(self.client.clone(), &spec.namespace());
        let selector = spec
            .labels()
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join(",");
        let pods = api
            .list(&ListParams::default().labels(&selector).limit(20))
            .await
            .map_err(|_| ExecutionError::Runtime)?;
        let Some(pod) = pods.items.first() else {
            return Ok(String::new());
        };
        spec.check_owner(&pod.metadata.labels.clone().unwrap_or_default())?;
        let logs = tokio::time::timeout(
            Duration::from_secs(10),
            api.logs(
                pod.metadata
                    .name
                    .as_deref()
                    .ok_or(ExecutionError::Ownership)?,
                &LogParams {
                    container: Some("runtime".into()),
                    tail_lines: Some(i64::from(tail)),
                    limit_bytes: Some(crate::logs::LIMIT as i64),
                    ..Default::default()
                },
            ),
        )
        .await
        .map_err(|_| ExecutionError::Runtime)?
        .map_err(|_| ExecutionError::Runtime)?;
        Ok(crate::logs::bounded(logs.as_bytes()))
    }
}

/// Exact bounded quantity vocabulary retained from the existing node observer.
pub fn parse_quantity(value: &str, cpu: bool) -> Result<u64> {
    parse_quantity_scaled(value, if cpu { 1000 } else { 1 })
}
fn parse_quantity_scaled(value: &str, scale: u64) -> Result<u64> {
    use rust_decimal::{Decimal, prelude::ToPrimitive};
    use std::str::FromStr;
    let split = value
        .find(|c: char| !c.is_ascii_digit() && c != '.')
        .unwrap_or(value.len());
    let mut number = Decimal::from_str(&value[..split])
        .map_err(|_| ExecutionError::Invalid("Kubernetes quantity"))?;
    let suffix = &value[split..];
    let factor = if (suffix.starts_with('e') || suffix.starts_with('E')) && suffix.len() > 1 {
        number = Decimal::from_scientific(value)
            .map_err(|_| ExecutionError::Invalid("Kubernetes quantity exponent"))?;
        Decimal::ONE
    } else {
        match suffix {
            "" => Decimal::ONE,
            "m" => Decimal::new(1, 3),
            "u" => Decimal::new(1, 6),
            "n" => Decimal::new(1, 9),
            "Ki" => Decimal::from(1024u64),
            "Mi" => Decimal::from(1024u64.pow(2)),
            "Gi" => Decimal::from(1024u64.pow(3)),
            "Ti" => Decimal::from(1024u64.pow(4)),
            "Pi" => Decimal::from(1024u64.pow(5)),
            "Ei" => Decimal::from(1024u64.pow(6)),
            "k" | "K" => Decimal::from(1000u64),
            "M" => Decimal::from(1000u64.pow(2)),
            "G" => Decimal::from(1000u64.pow(3)),
            "T" => Decimal::from(1000u64.pow(4)),
            "P" => Decimal::from(1000u64.pow(5)),
            "E" => Decimal::from(1000u64.pow(6)),
            _ => return Err(ExecutionError::Invalid("Kubernetes quantity suffix")),
        }
    };
    let result = number
        .checked_mul(factor)
        .and_then(|v| v.checked_mul(Decimal::from(scale)))
        .ok_or(ExecutionError::Invalid("Kubernetes quantity overflow"))?;
    if !result.fract().is_zero()
        || result.is_sign_negative()
        || result > Decimal::from(9_007_199_254_740_991u64)
    {
        return Err(ExecutionError::Invalid("Kubernetes quantity range"));
    }
    result
        .to_u64()
        .ok_or(ExecutionError::Invalid("Kubernetes quantity range"))
}
