use super::executor::*;
use super::*;
use kube::api::{DeleteParams, Preconditions};
use serde_json::json;
use webdock_agent_protocol::database::{
    DatabaseCheckpoint, DatabaseCheckpointPhase, DatabaseClaim, DatabaseCompletionProof,
    DatabaseProofState,
};
impl NativeDatabaseExecutor {
    pub(super) async fn checkpoint(
        &self,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
        phase: DatabaseCheckpointPhase,
        uid: &str,
    ) -> Result<()> {
        self.guard(claim, authority).await?;
        authority
            .checkpoint(
                claim,
                DatabaseCheckpoint {
                    lease: claim.lease.clone(),
                    phase,
                    cnpg_uid: uid.into(),
                    ca_certificate: None,
                    previous_pod_uid: None,
                    migration_job_uid: None,
                    copy_sha256: None,
                },
            )
            .await
    }
    pub(super) async fn patch_cluster(
        &self,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
        patch: serde_json::Value,
    ) -> Result<()> {
        self.patch_owned(
            "Cluster",
            "postgres",
            Some(&claim.spec.backend.namespace),
            &patch,
            claim,
            authority,
        )
        .await
        .map(|_| ())
    }
    async fn endpoints(
        &self,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
    ) -> Result<bool> {
        let b = &claim.spec.backend;
        for (suffix, target, port) in [
            ("direct", "postgres-rw", b.direct_port),
            ("pooled", "pooler", b.pooled_port),
        ] {
            let Some(service) = self.get("Service", target, Some(&b.namespace)).await? else {
                return Ok(false);
            };
            let controller = self
                .get(
                    if target == "pooler" {
                        "Pooler"
                    } else {
                        "Cluster"
                    },
                    if target == "pooler" {
                        "pooler"
                    } else {
                        "postgres"
                    },
                    Some(&b.namespace),
                )
                .await?
                .ok_or(ExecutionError::Ownership)?;
            self.owned(&controller, &claim.spec)?;
            if !service.metadata.owner_references.as_ref().is_some_and(|r| {
                r.iter()
                    .any(|r| Some(&r.uid) == controller.metadata.uid.as_ref())
            }) || service.data["spec"]["selector"]
                .as_object()
                .is_none_or(|s| s.is_empty())
            {
                return Err(ExecutionError::Ownership);
            }
            self.apply(json!({"apiVersion":"v1","kind":"Service","metadata":{"name":format!("public-{suffix}"),"namespace":b.namespace,"labels":{"webdock.dev/database-installation":b.id}},"spec":{"type":"NodePort","selector":service.data["spec"]["selector"],"ports":[{"name":"postgres","port":5432,"targetPort":5432,"nodePort":port,"protocol":"TCP"}]}}),claim,authority).await?;
        }
        Ok(true)
    }
    pub(super) async fn configure_stage(
        &self,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
    ) -> Result<DatabaseStep> {
        let job = &claim.spec;
        let b = &job.backend;
        let cluster = self
            .get("Cluster", "postgres", Some(&b.namespace))
            .await?
            .ok_or(ExecutionError::Ownership)?;
        self.owned(&cluster, job)?;
        let uid = cluster.metadata.uid.ok_or(ExecutionError::Ownership)?;
        if cluster.data["status"]["readyInstances"] != 1 && job.action != DatabaseAction::Restart {
            return Ok(DatabaseStep::Pending);
        }
        self.verify_storage(claim, authority).await?;
        self.checkpoint(claim, authority, DatabaseCheckpointPhase::Configuring, &uid)
            .await?;
        match job.action {
            DatabaseAction::Create | DatabaseAction::RotateCredentials | DatabaseAction::Resume
                if job.database.is_some() =>
            {
                let statements = super::sql::statements(job)?;
                let database = job.database.as_ref().unwrap();
                self.sql(claim, authority, "postgres", &statements.roles)
                    .await?;
                if !self.database_exists(claim, authority).await? {
                    if job.action != DatabaseAction::Create {
                        return Err(ExecutionError::Ownership);
                    }
                    self.sql(claim, authority, "postgres", &statements.create)
                        .await?;
                    self.sql(claim, authority, "postgres", &statements.mark)
                        .await?;
                }
                self.sql(claim, authority, "postgres", &statements.database)
                    .await?;
                self.sql(claim, authority, &database.name, &statements.schema)
                    .await?;
                self.patch_cluster(
                    claim,
                    authority,
                    json!({"spec":{"postgresql":{"pg_hba":self.config.hba(job)?}}}),
                )
                .await?;
                self.passwords(claim, authority).await?;
                self.sql(claim, authority, "postgres", &statements.enable)
                    .await?;
            }
            DatabaseAction::Pause | DatabaseAction::Delete if job.database.is_some() => {
                if !self.database_exists(claim, authority).await? {
                    return Err(ExecutionError::Ownership);
                }
                self.sql(
                    claim,
                    authority,
                    "postgres",
                    &super::sql::statements(job)?.disable,
                )
                .await?;
                if b.kind == "dedicated" {
                    self.patch_cluster(
                        claim,
                        authority,
                        json!({"metadata":{"annotations":{"cnpg.io/hibernation":"on"}}}),
                    )
                    .await?;
                }
            }
            DatabaseAction::Restart if b.kind == "dedicated" => {
                let pod = self
                    .get("Pod", "postgres-1", Some(&b.namespace))
                    .await?
                    .ok_or(ExecutionError::Ownership)?;
                if job.previous_pod_uid.is_none()
                    || pod.metadata.uid != job.previous_pod_uid
                    || !pod
                        .metadata
                        .owner_references
                        .as_ref()
                        .is_some_and(|refs| refs.iter().any(|r| r.uid == uid))
                {
                    return Err(ExecutionError::Ownership);
                }
                self.guarded(claim, authority, async {
                    self.api("Pod", Some(&b.namespace))?
                        .delete(
                            "postgres-1",
                            &DeleteParams {
                                preconditions: Some(Preconditions {
                                    uid: pod.metadata.uid,
                                    resource_version: pod.metadata.resource_version,
                                }),
                                ..Default::default()
                            },
                        )
                        .await
                        .map(|_| ())
                        .map_err(|_| ExecutionError::Runtime)
                })
                .await?;
            }
            DatabaseAction::Resize if job.database.is_some() => {
                let d = job.database.as_ref().unwrap();
                // Resource changes can immediately replace the primary Pod; finish SQL first.
                self.sql(claim,authority,"postgres",&format!("ALTER ROLE \"wd_migrate_{}\" CONNECTION LIMIT {}; ALTER ROLE \"wd_app_{}\" CONNECTION LIMIT {};",d.id,d.connection_limit,d.id,d.connection_limit)).await?;
                if b.kind == "dedicated" {
                    let objects = backend_manifests(job, &self.config)?;
                    self.apply(
                        objects
                            .iter()
                            .find(|o| o["kind"] == "ResourceQuota")
                            .ok_or(ExecutionError::Runtime)?
                            .clone(),
                        claim,
                        authority,
                    )
                    .await?;
                    let resources = objects
                        .iter()
                        .find(|o| o["kind"] == "Cluster")
                        .ok_or(ExecutionError::Runtime)?["spec"]["resources"]
                        .clone();
                    self.patch_cluster(claim, authority, json!({"spec":{"resources":resources}}))
                        .await?;
                }
            }
            DatabaseAction::Purge if job.database.is_some() && b.kind == "shared-pool" => {
                let d = job.database.as_ref().unwrap();
                if self.database_exists(claim, authority).await? {
                    self.sql(
                        claim,
                        authority,
                        "postgres",
                        &super::sql::statements(job)?.disable,
                    )
                    .await?;
                    self.sql(
                        claim,
                        authority,
                        "postgres",
                        &format!("DROP DATABASE \"{}\";", d.name),
                    )
                    .await?;
                }
                for prefix in ["wd_owner_", "wd_migrate_", "wd_app_"] {
                    let role = format!("{prefix}{}", d.id);
                    let owner=self.sql(claim,authority,"postgres",&format!("SELECT COALESCE(pg_catalog.shobj_description(oid,'pg_authid'),'unowned') FROM pg_catalog.pg_roles WHERE rolname='{role}';")).await?;
                    if !owner.is_empty() && owner != format!("webdock:database:{}", d.id) {
                        return Err(ExecutionError::Ownership);
                    }
                    let references=self.sql(claim,authority,"postgres",&format!("SELECT count(*) FROM pg_catalog.pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='{role}');")).await?;
                    if references == "0" {
                        self.sql(
                            claim,
                            authority,
                            "postgres",
                            &format!("DROP ROLE IF EXISTS \"{role}\";"),
                        )
                        .await?;
                    }
                }
            }
            DatabaseAction::Create | DatabaseAction::PrepareMigration => {}
            _ => return Err(ExecutionError::Unsupported("database maintenance action")),
        }
        if !matches!(
            job.action,
            DatabaseAction::Pause | DatabaseAction::Delete | DatabaseAction::Purge
        ) && !self.endpoints(claim, authority).await?
        {
            return Err(ExecutionError::Runtime);
        }
        self.checkpoint(claim, authority, DatabaseCheckpointPhase::Observing, &uid)
            .await?;
        Ok(DatabaseStep::Pending)
    }
    pub(super) async fn observe_stage(
        &self,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
    ) -> Result<DatabaseStep> {
        let job = &claim.spec;
        let b = &job.backend;
        let cluster = self
            .get("Cluster", "postgres", Some(&b.namespace))
            .await?
            .ok_or(ExecutionError::Ownership)?;
        self.owned(&cluster, job)?;
        let uid = cluster
            .metadata
            .uid
            .clone()
            .ok_or(ExecutionError::Ownership)?;
        self.checkpoint(claim, authority, DatabaseCheckpointPhase::Observing, &uid)
            .await?;
        if matches!(job.action, DatabaseAction::Pause | DatabaseAction::Delete) {
            if b.kind == "dedicated" {
                let pods: kube::Api<k8s_openapi::api::core::v1::Pod> =
                    kube::Api::namespaced(self.client.clone(), &b.namespace);
                let pods = pods
                    .list(&kube::api::ListParams::default().limit(201))
                    .await
                    .map_err(|_| ExecutionError::Runtime)?;
                if pods.metadata.continue_.is_some_and(|s| !s.is_empty()) || pods.items.len() > 200
                {
                    return Err(ExecutionError::Runtime);
                }
                if pods
                    .items
                    .iter()
                    .filter(|p| {
                        !p.status
                            .as_ref()
                            .and_then(|s| s.phase.as_deref())
                            .is_some_and(|phase| matches!(phase, "Succeeded" | "Failed"))
                    })
                    .filter_map(|p| p.spec.as_ref()?.volumes.as_ref())
                    .flatten()
                    .filter_map(|v| v.persistent_volume_claim.as_ref())
                    .any(|claim| claim.claim_name == "postgres-1")
                {
                    return Ok(DatabaseStep::Pending);
                }
                let helper = crate::storage::database::DatabaseStorageClient::new(
                    self.config.storage_route(&b.node, &b.pool_id)?.into(),
                );
                self.guarded(
                    claim,
                    authority,
                    helper.retained(&self.storage_packet(claim)?),
                )
                .await?;
            } else if let Some(d) = &job.database
                && self.sql(claim,authority,"postgres",&format!("SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('wd_migrate_{}','wd_app_{}') AND rolcanlogin;",d.id,d.id)).await?!="0"{return Ok(DatabaseStep::Pending);}
            return Ok(DatabaseStep::Complete(DatabaseCompletionProof {
                installation_id: b.id.clone(),
                database_id: job.database.as_ref().map(|d| d.id.clone()),
                cnpg_uid: uid,
                revision: job.revision,
                state: if job.action == DatabaseAction::Pause {
                    DatabaseProofState::Paused
                } else {
                    DatabaseProofState::Retained
                },
                endpoint_ready: b.kind == "shared-pool",
                copy_sha256: None,
            }));
        }
        if job.action == DatabaseAction::Purge {
            if self.database_exists(claim, authority).await? {
                return Ok(DatabaseStep::Pending);
            }
            return Ok(DatabaseStep::Complete(DatabaseCompletionProof {
                installation_id: b.id.clone(),
                database_id: job.database.as_ref().map(|d| d.id.clone()),
                cnpg_uid: uid,
                revision: job.revision,
                state: DatabaseProofState::Purged,
                endpoint_ready: true,
                copy_sha256: None,
            }));
        }
        let Some(pod) = self.get("Pod", "postgres-1", Some(&b.namespace)).await? else {
            return Ok(DatabaseStep::Pending);
        };
        if cluster.data["status"]["readyInstances"] != 1
            || !pod.data["status"]["conditions"]
                .as_array()
                .is_some_and(|conditions| {
                    conditions
                        .iter()
                        .any(|c| c["type"] == "Ready" && c["status"] == "True")
                })
            || !pod
                .metadata
                .owner_references
                .as_ref()
                .is_some_and(|refs| refs.iter().any(|r| r.uid == uid))
        {
            return Ok(DatabaseStep::Pending);
        }
        let container = pod.data["spec"]["containers"]
            .as_array()
            .and_then(|c| c.iter().find(|c| c["name"] == "postgres"))
            .ok_or(ExecutionError::Ownership)?;
        if container["image"] != self.config.image {
            return Err(ExecutionError::Ownership);
        }
        for kind in ["requests", "limits"] {
            if crate::kubernetes::parse_quantity(
                container["resources"][kind]["cpu"]
                    .as_str()
                    .ok_or(ExecutionError::Ownership)?,
                true,
            )? != b.resources.cpu_millicores
                || crate::kubernetes::parse_quantity(
                    container["resources"][kind]["memory"]
                        .as_str()
                        .ok_or(ExecutionError::Ownership)?,
                    false,
                )? != b.resources.memory_bytes
            {
                return Ok(DatabaseStep::Pending);
            }
        }
        if job.action == DatabaseAction::Restart
            && (job.previous_pod_uid.is_none() || pod.metadata.uid == job.previous_pod_uid)
        {
            return Ok(DatabaseStep::Pending);
        }
        if job.database.is_some() && !self.database_exists(claim, authority).await? {
            return Err(ExecutionError::Ownership);
        }
        let Some(pooler) = self.get("Deployment", "pooler", Some(&b.namespace)).await? else {
            return Ok(DatabaseStep::Pending);
        };
        let Some(certificate) = self
            .get("Certificate", "server-tls", Some(&b.namespace))
            .await?
        else {
            return Ok(DatabaseStep::Pending);
        };
        self.owned(&certificate, job)?;
        if pooler.data["status"]["readyReplicas"] != 1
            || !certificate.data["status"]["conditions"]
                .as_array()
                .is_some_and(|cs| {
                    cs.iter()
                        .any(|c| c["type"] == "Ready" && c["status"] == "True")
                })
        {
            return Ok(DatabaseStep::Pending);
        }
        for (name, port) in [
            ("public-direct", b.direct_port),
            ("public-pooled", b.pooled_port),
        ] {
            let Some(service) = self.get("Service", name, Some(&b.namespace)).await? else {
                return Ok(DatabaseStep::Pending);
            };
            self.owned(&service, job)?;
            if service.data["spec"]["type"] != "NodePort"
                || !service.data["spec"]["ports"]
                    .as_array()
                    .is_some_and(|ports| ports.iter().any(|p| p["nodePort"] == port))
            {
                return Err(ExecutionError::Ownership);
            }
        }
        if !self.verify_logins(claim, authority).await? {
            return Ok(DatabaseStep::Pending);
        }
        self.guard(claim, authority).await?;
        Ok(DatabaseStep::Complete(DatabaseCompletionProof {
            installation_id: b.id.clone(),
            database_id: job.database.as_ref().map(|d| d.id.clone()),
            cnpg_uid: uid,
            revision: job.revision,
            state: DatabaseProofState::Ready,
            endpoint_ready: true,
            copy_sha256: None,
        }))
    }
    async fn verify_logins(
        &self,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
    ) -> Result<bool> {
        let Some(d) = &claim.spec.database else {
            return Err(ExecutionError::Unsupported("physical-only TLS observation"));
        };
        let credentials = claim
            .material
            .credentials
            .as_ref()
            .ok_or(ExecutionError::Denied)?;
        let mut roots = rustls::RootCertStore::empty();
        for cert in rustls_pemfile::certs(&mut self.ca.as_slice()) {
            roots
                .add(cert.map_err(|_| ExecutionError::Invalid("database trust"))?)
                .map_err(|_| ExecutionError::Invalid("database trust"))?;
        }
        let tls = rustls::ClientConfig::builder_with_provider(std::sync::Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|_| ExecutionError::Runtime)?
        .with_root_certificates(roots)
        .with_no_client_auth();
        for (role, password, port) in [
            (
                format!("wd_migrate_{}", d.id),
                &credentials.migration_password,
                claim.spec.backend.direct_port,
            ),
            (
                format!("wd_app_{}", d.id),
                &credentials.application_password,
                claim.spec.backend.pooled_port,
            ),
        ] {
            let mut config = tokio_postgres::Config::new();
            config
                .host(&claim.spec.backend.host)
                .port(port)
                .dbname(&d.name)
                .user(&role)
                .password(password)
                .ssl_mode(tokio_postgres::config::SslMode::Require)
                .connect_timeout(std::time::Duration::from_secs(3));
            let tls = tokio_postgres_rustls::MakeRustlsConnect::new(tls.clone());
            let work = async {
                let (client, connection) = config
                    .connect(tls)
                    .await
                    .map_err(|_| ExecutionError::Runtime)?;
                tokio::pin!(connection);
                let query = client.query_one(
                    "SELECT current_user::text,pg_catalog.current_database()::text",
                    &[],
                );
                tokio::pin!(query);
                let row = tokio::select! {row=&mut query=>row.map_err(|_|ExecutionError::Runtime)?,_=&mut connection=>return Err(ExecutionError::Runtime)};
                if row.get::<_, String>(0) != role || row.get::<_, String>(1) != d.name {
                    return Err(ExecutionError::Ownership);
                }
                Ok(())
            };
            match self
                .guarded(claim, authority, async {
                    tokio::time::timeout(std::time::Duration::from_secs(8), work)
                        .await
                        .map_err(|_| ExecutionError::Runtime)?
                })
                .await
            {
                Ok(()) => {}
                Err(ExecutionError::Runtime) => return Ok(false),
                Err(e) => return Err(e),
            }
        }
        Ok(true)
    }
}

impl NativeDatabaseExecutor {
    async fn volume_users(&self, namespace: &str) -> Result<bool> {
        let pods: kube::Api<k8s_openapi::api::core::v1::Pod> =
            kube::Api::namespaced(self.client.clone(), namespace);
        let pods = match pods
            .list(&kube::api::ListParams::default().limit(201))
            .await
        {
            Ok(p) => p,
            Err(kube::Error::Api(e)) if e.code == 404 => return Ok(false),
            Err(_) => return Err(ExecutionError::Runtime),
        };
        if pods.items.len() > 200 || pods.metadata.continue_.is_some_and(|v| !v.is_empty()) {
            return Err(ExecutionError::Runtime);
        }
        Ok(pods
            .items
            .iter()
            .filter(|p| {
                !p.status
                    .as_ref()
                    .and_then(|s| s.phase.as_deref())
                    .is_some_and(|phase| matches!(phase, "Succeeded" | "Failed"))
            })
            .any(|p| {
                p.spec
                    .as_ref()
                    .and_then(|s| s.volumes.as_ref())
                    .is_some_and(|v| {
                        v.iter().any(|v| {
                            v.persistent_volume_claim
                                .as_ref()
                                .is_some_and(|c| c.claim_name == "postgres-1")
                        })
                    })
            }))
    }
    pub(super) async fn delete_owned(
        &self,
        kind: &str,
        name: &str,
        namespace: Option<&str>,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
        cnpg_owner: bool,
    ) -> Result<bool> {
        let Some(object) = self.get(kind, name, namespace).await? else {
            return Ok(false);
        };
        if cnpg_owner {
            if object.metadata.namespace.as_deref() != Some(claim.spec.backend.namespace.as_str())
                || !object
                    .metadata
                    .owner_references
                    .as_ref()
                    .is_some_and(|refs| {
                        refs.iter()
                            .any(|r| Some(&r.uid) == claim.spec.backend.cnpg_uid.as_ref())
                    })
            {
                return Err(ExecutionError::Ownership);
            }
        } else {
            self.owned(&object, &claim.spec)?;
        }
        let uid = object.metadata.uid.ok_or(ExecutionError::Ownership)?;
        let version = object
            .metadata
            .resource_version
            .ok_or(ExecutionError::Ownership)?;
        self.guarded(claim, authority, async {
            self.api(kind, namespace)?
                .delete(
                    name,
                    &DeleteParams {
                        propagation_policy: Some(kube::api::PropagationPolicy::Foreground),
                        preconditions: Some(Preconditions {
                            uid: Some(uid),
                            resource_version: Some(version),
                        }),
                        ..Default::default()
                    },
                )
                .await
                .map(|_| ())
                .map_err(|_| ExecutionError::Runtime)
        })
        .await?;
        Ok(true)
    }
    pub(super) async fn purge_stage(
        &self,
        claim: &DatabaseClaim,
        authority: &dyn DatabaseAuthority,
    ) -> Result<DatabaseStep> {
        use webdock_agent_protocol::database::DatabaseExecutionPhase;
        let b = &claim.spec.backend;
        let uid = b.cnpg_uid.as_deref().ok_or(ExecutionError::Ownership)?;
        let namespace = self.get("Namespace", &b.namespace, None).await?;
        if let Some(namespace) = &namespace {
            self.owned(namespace, &claim.spec)?;
        }
        let helper = crate::storage::database::DatabaseStorageClient::new(
            self.config.storage_route(&b.node, &b.pool_id)?.into(),
        );
        let packet = self.storage_packet(claim)?;
        match claim.spec.phase {
            DatabaseExecutionPhase::Apply => {
                if let Some(cluster) = self.get("Cluster", "postgres", Some(&b.namespace)).await? {
                    self.owned(&cluster, &claim.spec)?;
                    if cluster
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| a.get("cnpg.io/hibernation"))
                        .map(String::as_str)
                        != Some("on")
                        || self.volume_users(&b.namespace).await?
                    {
                        return Err(ExecutionError::Ownership);
                    }
                    self.verify_storage(claim, authority).await?;
                }
                for (kind, name) in [
                    ("Service", "public-direct"),
                    ("Service", "public-pooled"),
                    ("Pooler", "pooler"),
                    ("Cluster", "postgres"),
                ] {
                    self.delete_owned(kind, name, Some(&b.namespace), claim, authority, false)
                        .await?;
                }
                self.checkpoint(claim, authority, DatabaseCheckpointPhase::Applied, uid)
                    .await?;
                Ok(DatabaseStep::Pending)
            }
            DatabaseExecutionPhase::Configure => {
                if self
                    .get("Cluster", "postgres", Some(&b.namespace))
                    .await?
                    .is_some()
                    || self
                        .get("Pooler", "pooler", Some(&b.namespace))
                        .await?
                        .is_some()
                    || self.volume_users(&b.namespace).await?
                {
                    return Ok(DatabaseStep::Pending);
                }
                let pv = self
                    .get("PersistentVolume", &format!("wd-db-{}", b.id), None)
                    .await?;
                let pvc = self
                    .get("PersistentVolumeClaim", "postgres-1", Some(&b.namespace))
                    .await?;
                if let Some(pv) = &pv {
                    self.owned(pv, &claim.spec)?;
                    if pv.data["spec"]["claimRef"]["namespace"] != b.namespace
                        || pv.data["spec"]["claimRef"]["name"] != "postgres-1"
                    {
                        return Err(ExecutionError::Ownership);
                    }
                    if let Some(pvc) = &pvc
                        && pv.data["spec"]["claimRef"]["uid"].as_str()
                            != pvc.metadata.uid.as_deref()
                    {
                        return Err(ExecutionError::Ownership);
                    }
                }
                if let Some(pvc) = &pvc {
                    if pvc.data["spec"]["volumeName"] != format!("wd-db-{}", b.id) {
                        return Err(ExecutionError::Ownership);
                    }
                    self.delete_owned(
                        "PersistentVolumeClaim",
                        "postgres-1",
                        Some(&b.namespace),
                        claim,
                        authority,
                        true,
                    )
                    .await?;
                    return Ok(DatabaseStep::Pending);
                }
                if pv.is_some() {
                    self.delete_owned(
                        "PersistentVolume",
                        &format!("wd-db-{}", b.id),
                        None,
                        claim,
                        authority,
                        false,
                    )
                    .await?;
                    return Ok(DatabaseStep::Pending);
                }
                self.checkpoint(claim, authority, DatabaseCheckpointPhase::Configuring, uid)
                    .await?;
                self.guarded(claim, authority, helper.purge(&packet))
                    .await?;
                if namespace.is_some() {
                    self.delete_owned("Namespace", &b.namespace, None, claim, authority, false)
                        .await?;
                }
                self.checkpoint(claim, authority, DatabaseCheckpointPhase::Observing, uid)
                    .await?;
                Ok(DatabaseStep::Pending)
            }
            DatabaseExecutionPhase::Observe => {
                self.checkpoint(claim, authority, DatabaseCheckpointPhase::Observing, uid)
                    .await?;
                if namespace.is_some()
                    || self
                        .get("PersistentVolume", &format!("wd-db-{}", b.id), None)
                        .await?
                        .is_some()
                {
                    return Ok(DatabaseStep::Pending);
                }
                if self
                    .guarded(claim, authority, helper.state(&packet))
                    .await?
                    .state
                    != crate::storage::VolumeState::Purged
                {
                    return Ok(DatabaseStep::Pending);
                }
                Ok(DatabaseStep::Complete(DatabaseCompletionProof {
                    installation_id: b.id.clone(),
                    database_id: claim.spec.database.as_ref().map(|d| d.id.clone()),
                    cnpg_uid: uid.into(),
                    revision: claim.spec.revision,
                    state: DatabaseProofState::Purged,
                    endpoint_ready: false,
                    copy_sha256: None,
                }))
            }
            DatabaseExecutionPhase::Uncertain => Err(ExecutionError::Conflict),
        }
    }
}
