//! Standalone worker transport; enrollment secrets never enter guest requests or redirects.
use crate::{
    Result,
    artifact::{ArtifactStore, MAX_OUTPUT, MAX_SOURCE},
    error,
    execution::{GuestRequest, VmImage},
    io,
    publisher::{PublicationGuard, RegistryCredential, RegistryPublisher},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
#[derive(Clone)]
pub struct ControlClient {
    base: url::Url,
    credential: String,
    client: reqwest::Client,
}
impl ControlClient {
    pub fn new(base: &str, credential: String) -> Result<Self> {
        Self::configured(base, credential, false)
    }
    #[cfg(feature = "local-registry-test")]
    pub fn loopback_test(base: &str, credential: String) -> Result<Self> {
        Self::configured(base, credential, true)
    }
    fn configured(base: &str, credential: String, loopback: bool) -> Result<Self> {
        let mut base = url::Url::parse(base).map_err(|_| error("invalid_control_origin"))?;
        let local = base
            .host_str()
            .and_then(|v| v.parse::<std::net::IpAddr>().ok())
            .is_some_and(|ip| ip.is_loopback());
        if (base.scheme() != "https" && !(loopback && base.scheme() == "http" && local))
            || base.host_str().is_none()
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || credential.len() != 43
            || !credential
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(error("invalid_control_configuration"));
        }
        base.set_path(base.path().trim_end_matches('/').to_owned().as_str());
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|_| error("control_unavailable"))?;
        Ok(Self {
            base,
            credential,
            client,
        })
    }
    async fn fetch(
        &self,
        path: &str,
        body: Option<&Value>,
        limit: u64,
        timeout: Duration,
    ) -> Result<Vec<u8>> {
        if !path.starts_with('/') || path.starts_with("//") || path.contains(['#', '\\']) {
            return Err(error("invalid_control_path"));
        }
        let url = format!("{}{}", self.base.as_str().trim_end_matches('/'), path);
        let mut request = if let Some(body) = body {
            self.client.post(url).json(body)
        } else {
            self.client.get(url)
        };
        request = request.bearer_auth(&self.credential).timeout(timeout);
        let mut response = request
            .send()
            .await
            .map_err(|_| error("control_request_failed"))?;
        if !response.status().is_success() {
            return Err(error(match response.status().as_u16() {
                401 | 403 => "worker_revoked",
                409 => "lease_changed",
                _ => "control_request_failed",
            }));
        }
        if response.content_length().is_some_and(|n| n > limit) {
            return Err(error("control_response_limit"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| error("control_request_failed"))?
        {
            if bytes.len() as u64 + chunk.len() as u64 > limit {
                return Err(error("control_response_limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
    pub async fn post(&self, endpoint: &str, body: &Value) -> Result<Value> {
        if ![
            "claim",
            "complete",
            "release-claim",
            "release-prepare",
            "container-publish",
            "observe",
            "release-complete",
            "retention",
            "retention-complete",
            "orphan-retention",
        ]
        .contains(&endpoint)
        {
            return Err(error("invalid_control_path"));
        }
        let bytes = self
            .fetch(
                &format!("/{endpoint}"),
                Some(body),
                1024 * 1024,
                Duration::from_secs(30),
            )
            .await?;
        serde_json::from_slice(&bytes).map_err(|_| error("invalid_control_response"))
    }
    pub async fn guard_build(&self, id: &str, generation: i32) -> Result<()> {
        self.guard("builds", id, generation).await
    }
    pub async fn guard_release(&self, id: &str, generation: i32) -> Result<()> {
        self.guard("releases", id, generation).await
    }
    async fn guard(&self, kind: &str, id: &str, generation: i32) -> Result<()> {
        crate::contracts::id(id)?;
        if generation <= 0 {
            return Err(error("invalid_generation"));
        }
        let bytes = self
            .fetch(
                &format!("/{kind}/{id}/lease?generation={generation}"),
                None,
                1024,
                Duration::from_secs(5),
            )
            .await?;
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| error("invalid_control_response"))?;
        if value != json!({"active":true}) {
            return Err(error("lease_changed"));
        }
        Ok(())
    }
    pub async fn archive(&self, id: &str, generation: i32) -> Result<Vec<u8>> {
        crate::contracts::id(id)?;
        if generation <= 0 {
            return Err(error("invalid_generation"));
        }
        self.fetch(
            &format!("/builds/{id}/archive?generation={generation}"),
            None,
            MAX_SOURCE,
            Duration::from_secs(60),
        )
        .await
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pending {
    version: u8,
    endpoint: String,
    body: Value,
}
/// Private exact-request outbox. A completion is fsynced before its first HTTP request.
pub struct Outbox {
    root: PathBuf,
}
impl Outbox {
    pub fn open(root: PathBuf) -> Result<Self> {
        let m = root.symlink_metadata().map_err(io)?;
        // SAFETY: geteuid has no preconditions or pointer arguments.
        if !m.is_dir() || m.mode() & 0o077 != 0 || m.uid() != unsafe { libc::geteuid() } {
            return Err(error("private_outbox_required"));
        }
        Ok(Self {
            root: root.canonicalize().map_err(io)?,
        })
    }
    pub fn has_pending(&self) -> bool {
        self.root.join("pending.json").exists()
    }
    pub fn put(&self, endpoint: &str, body: Value) -> Result<()> {
        if !["complete", "container-publish", "release-complete"].contains(&endpoint)
            || self.has_pending()
        {
            return Err(error("pending_completion"));
        }
        let bytes = serde_json::to_vec(&Pending {
            version: 1,
            endpoint: endpoint.into(),
            body,
        })
        .map_err(|_| error("invalid_completion"))?;
        if bytes.len() > 400000 {
            return Err(error("completion_limit"));
        }
        let mut file = tempfile::NamedTempFile::new_in(&self.root).map_err(io)?;
        file.as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(io)?;
        file.write_all(&bytes).map_err(io)?;
        file.as_file().sync_all().map_err(io)?;
        file.persist_noclobber(self.root.join("pending.json"))
            .map_err(|_| error("pending_completion"))?;
        std::fs::File::open(&self.root)
            .map_err(io)?
            .sync_all()
            .map_err(io)?;
        Ok(())
    }
    pub async fn flush(&self, client: &ControlClient) -> Result<Option<Value>> {
        let path = self.root.join("pending.json");
        let mut file = match std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&path)
        {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(io(e)),
        };
        let m = file.metadata().map_err(io)?;
        if !m.is_file() || m.mode() & 0o077 != 0 || m.len() > 400000 {
            return Err(error("invalid_outbox"));
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(io)?;
        let pending: Pending =
            serde_json::from_slice(&bytes).map_err(|_| error("invalid_outbox"))?;
        if pending.version != 1
            || !["complete", "container-publish", "release-complete"]
                .contains(&pending.endpoint.as_str())
        {
            return Err(error("invalid_outbox"));
        }
        let result = client.post(&pending.endpoint, &pending.body).await?;
        std::fs::remove_file(path).map_err(io)?;
        std::fs::File::open(&self.root)
            .map_err(io)?
            .sync_all()
            .map_err(io)?;
        Ok(Some(result))
    }
}
fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value[key]
        .as_str()
        .ok_or_else(|| error("invalid_control_response"))
}
fn generation(value: &Value) -> Result<i32> {
    value["generation"]
        .as_i64()
        .filter(|g| *g > 0 && *g <= i64::from(i32::MAX))
        .map(|g| g as i32)
        .ok_or_else(|| error("invalid_generation"))
}
fn deadline(value: &Value) -> Result<i64> {
    chrono::DateTime::parse_from_rfc3339(string(value, "leaseUntil")?)
        .map(|d| d.timestamp())
        .map_err(|_| error("invalid_lease"))
}
pub struct Worker {
    _lock: std::fs::File,
    control: ControlClient,
    image: Arc<VmImage>,
    store: Arc<ArtifactStore>,
    scratch: PathBuf,
    outbox: Outbox,
    publishers: BTreeMap<String, (String, Arc<RegistryPublisher>)>,
}
impl Worker {
    pub fn new(
        control: ControlClient,
        image: VmImage,
        store: ArtifactStore,
        scratch: PathBuf,
        outbox: Outbox,
    ) -> Result<Self> {
        let m = scratch.symlink_metadata().map_err(io)?;
        if !m.is_dir() || m.mode() & 0o077 != 0 {
            return Err(error("private_scratch_required"));
        }
        use std::os::fd::AsRawFd;
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(outbox.root.join("worker.lock"))
            .map_err(io)?;
        // SAFETY: the live File owns this descriptor and flock does not retain it.
        if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            return Err(error("worker_already_running"));
        }
        Ok(Self {
            _lock: lock,
            control,
            image: Arc::new(image),
            store: Arc::new(store),
            scratch,
            outbox,
            publishers: BTreeMap::new(),
        })
    }
    pub fn with_publisher(
        mut self,
        project: String,
        repository: String,
        publisher: RegistryPublisher,
    ) -> Result<Self> {
        crate::contracts::id(&project)?;
        self.publishers
            .insert(project, (repository, Arc::new(publisher)));
        Ok(self)
    }
    pub async fn build_once(&self) -> Result<bool> {
        self.outbox.flush(&self.control).await?;
        let job = self.control.post("claim", &json!({})).await?;
        if job.is_null() {
            return Ok(false);
        }
        let id = string(&job, "buildID")?.to_owned();
        let customer = string(&job, "customerID")?.to_owned();
        crate::contracts::id(&id)?;
        crate::contracts::id(&customer)?;
        crate::contracts::id(string(&job, "projectID")?)?;
        crate::contracts::sha(string(&job, "sourceSHA")?)?;
        let generation = generation(&job)?;
        let request: GuestRequest =
            serde_json::from_value(job["request"].clone()).map_err(|_| error("invalid_job"))?;
        request.validate()?;
        if deadline(&job)? - chrono::Utc::now().timestamp()
            < request.limits.duration_seconds as i64 + 60
        {
            return Err(error("lease_too_short"));
        }
        let source = self.control.archive(&id, generation).await?;
        self.control.guard_build(&id, generation).await?;
        let control = self.control.clone();
        let build = id.clone();
        let image = self.image.clone();
        let scratch = self.scratch.clone();
        let runtime = tokio::runtime::Handle::current();
        let redactor = request.clone();
        let built = tokio::task::spawn_blocking(move || {
            image.execute(&request, &source, &scratch, || {
                runtime.block_on(control.guard_build(&build, generation))
            })
        })
        .await
        .map_err(|_| error("build_execution_failed"))?;
        let body = match built {
            Ok(output) => {
                let artifact = self
                    .store
                    .put(&customer, &id, generation, &output.artifact)?;
                json!({"buildID":id,"generation":generation,"status":"succeeded","logs":output.logs,"artifact":{"kind":"oci","digest":artifact.digest(),"storageKey":artifact.storage_key(),"sizeBytes":artifact.size(),"imageDigest":artifact.image_digest()}})
            }
            Err(e)
                if matches!(
                    e.code,
                    "worker_revoked" | "lease_changed" | "build_lease_lost"
                ) =>
            {
                return Err(e);
            }
            Err(e) => {
                json!({"buildID":id,"generation":generation,"status":"failed","failureCode":"BUILD_FAILED","logs":redactor.redact(&e.logs)})
            }
        };
        self.outbox.put("complete", body)?;
        self.outbox.flush(&self.control).await?;
        Ok(true)
    }
    pub async fn publish_once(&self) -> Result<bool> {
        self.outbox.flush(&self.control).await?;
        let release = self.control.post("release-claim", &json!({})).await?;
        if release.is_null() {
            return Ok(false);
        }
        let id = string(&release, "releaseID")?.to_owned();
        let generation = generation(&release)?;
        let base = json!({"releaseID":id,"generation":generation});
        let publish = async {
            let prepared = self.control.post("release-prepare", &base).await?;
            if prepared["kind"] != "oci" {
                return Err(error("publication_kind_unavailable"));
            }
            let project = string(&release, "projectID")?;
            let customer = string(&release, "customerID")?;
            let (policy, publisher) = self
                .publishers
                .get(project)
                .ok_or_else(|| error("registry_policy_unavailable"))?;
            if policy != string(&prepared, "repository")? {
                return Err(error("registry_scope_mismatch"));
            }
            let record = &release["artifact"];
            let artifact = self.store.load(
                string(record, "storageKey")?.into(),
                string(record, "digest")?.into(),
                record["sizeBytes"]
                    .as_u64()
                    .filter(|s| *s <= MAX_OUTPUT)
                    .ok_or_else(|| error("invalid_artifact"))?,
                string(record, "imageDigest")?.into(),
            )?;
            struct Guard<'a> {
                client: &'a ControlClient,
                id: &'a str,
                generation: i32,
            }
            #[async_trait::async_trait]
            impl PublicationGuard for Guard<'_> {
                async fn check(&self) -> Result<()> {
                    self.client.guard_release(self.id, self.generation).await
                }
            }
            let image = publisher
                .publish(
                    customer,
                    project,
                    &id,
                    &self.store,
                    &artifact,
                    &Guard {
                        client: &self.control,
                        id: &id,
                        generation,
                    },
                )
                .await?;
            self.outbox.put(
                "container-publish",
                json!({"releaseID":id,"generation":generation,"image":image}),
            )?;
            self.outbox.flush(&self.control).await?;
            let expires = deadline(&release)?.saturating_sub(30);
            while chrono::Utc::now().timestamp() < expires {
                let observed = self.control.post("observe", &base).await?;
                if observed["status"] != "deploying" {
                    return Ok::<(), crate::Error>(());
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
            Err(error("publication_uncertain"))
        }
        .await;
        if let Err(e) = publish {
            if self.outbox.has_pending() {
                return Err(e);
            }
            self.outbox.put(
                "release-complete",
                json!({"releaseID":id,"generation":generation,"status":"needs-reconciliation"}),
            )?;
            self.outbox.flush(&self.control).await?;
            return Err(e);
        }
        Ok(true)
    }
    pub async fn turn(&self, prefer_release: bool) -> Result<bool> {
        self.outbox.flush(&self.control).await?;
        if prefer_release {
            if self.publish_once().await? {
                Ok(true)
            } else {
                self.build_once().await
            }
        } else if self.build_once().await? {
            Ok(true)
        } else {
            self.publish_once().await
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkerConfig {
    #[serde(rename = "controlURL")]
    control_url: String,
    credential_file: PathBuf,
    image: PathBuf,
    #[serde(rename = "imageSHA256")]
    image_sha256: String,
    #[serde(default)]
    kernel: Option<PathBuf>,
    #[serde(default, rename = "kernelSHA256")]
    kernel_sha256: Option<String>,
    #[serde(default)]
    initrd: Option<PathBuf>,
    #[serde(default, rename = "initrdSHA256")]
    initrd_sha256: Option<String>,
    artifact_root: PathBuf,
    scratch_root: PathBuf,
    state_root: PathBuf,
    country: String,
    isolation: String,
    location_evidence: String,
    isolation_evidence: String,
    storage_evidence: String,
    #[serde(default)]
    registry_projects: BTreeMap<String, RegistryPolicy>,
    #[serde(default = "store_limit")]
    artifact_store_limit: u64,
}
fn store_limit() -> u64 {
    20 * 1024 * 1024 * 1024
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegistryPolicy {
    repository: String,
    credential_file: PathBuf,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegistrySecret {
    username: String,
    password: String,
}
fn private_file(path: &Path, limit: u64) -> Result<Vec<u8>> {
    if !path.is_absolute() {
        return Err(error("untrusted_configuration"));
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(io)?;
    let meta = file.metadata().map_err(io)?;
    if !meta.is_file()
        || meta.uid() != 0
        || meta.mode() & 0o022 != 0
        || meta.nlink() != 1
        || meta.len() > limit
    {
        return Err(error("untrusted_configuration"));
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes).map_err(io)?;
    if bytes.len() as u64 > limit {
        return Err(error("configuration_limit"));
    }
    Ok(bytes)
}
impl WorkerConfig {
    pub fn load(path: &Path) -> Result<Self> {
        serde_json::from_slice(&private_file(path, 65536)?)
            .map_err(|_| error("invalid_worker_configuration"))
    }
    pub fn build(self) -> Result<Worker> {
        if self.country.len() != 2
            || !self.country.bytes().all(|c| c.is_ascii_uppercase())
            || self.isolation != "qemu-kvm"
            || self.location_evidence.is_empty()
            || self.isolation_evidence.is_empty()
            || self.storage_evidence.is_empty()
            || (self.country == "ZZ"
                && !self
                    .location_evidence
                    .split(|c: char| !c.is_alphanumeric())
                    .any(|s| s.eq_ignore_ascii_case("unverified")))
        {
            return Err(error("worker_evidence_required"));
        }
        let credential = String::from_utf8(private_file(&self.credential_file, 256)?)
            .map_err(|_| error("invalid_credential"))?
            .trim()
            .to_owned();
        let control = ControlClient::new(&self.control_url, credential)?;
        let meta = self.image.symlink_metadata().map_err(io)?;
        if !meta.is_file() || meta.uid() != 0 || meta.mode() & 0o022 != 0 {
            return Err(error("untrusted_image"));
        }
        let mut image = VmImage::new(self.image, self.image_sha256)?;
        match (
            self.kernel,
            self.kernel_sha256,
            self.initrd,
            self.initrd_sha256,
        ) {
            (Some(kernel), Some(ksha), Some(initrd), Some(isha)) => {
                for file in [&kernel, &initrd] {
                    let m = file.symlink_metadata().map_err(io)?;
                    if !m.is_file() || m.uid() != 0 || m.mode() & 0o022 != 0 {
                        return Err(error("untrusted_image"));
                    }
                }
                image = image.with_boot(kernel, ksha, initrd, isha)?;
            }
            (None, None, None, None) => {}
            _ => return Err(error("invalid_boot_configuration")),
        }
        std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open("/dev/kvm")
            .map_err(|_| error("kvm_required"))?;
        let store = ArtifactStore::open(self.artifact_root, self.artifact_store_limit)?;
        let outbox = Outbox::open(self.state_root)?;
        let mut worker = Worker::new(control, image, store, self.scratch_root, outbox)?;
        for (project, policy) in self.registry_projects {
            crate::contracts::id(&project)?;
            let prefix = policy
                .repository
                .split('/')
                .next()
                .ok_or_else(|| error("invalid_registry_policy"))?;
            if !policy.repository.ends_with(&format!("/projects/{project}"))
                || policy.repository.contains("..")
                || !policy.repository.contains("/customers/")
            {
                return Err(error("invalid_registry_policy"));
            }
            let auth: RegistrySecret =
                serde_json::from_slice(&private_file(&policy.credential_file, 16384)?)
                    .map_err(|_| error("invalid_registry_credential"))?;
            if auth.username.is_empty() || auth.password.is_empty() {
                return Err(error("invalid_registry_credential"));
            }
            let publisher = RegistryPublisher::new(
                prefix.into(),
                RegistryCredential::Basic(auth.username, auth.password),
            )?;
            worker = worker.with_publisher(project, policy.repository, publisher)?;
        }
        Ok(worker)
    }
}
