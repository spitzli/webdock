use super::*;

impl HostService {
    pub(super) async fn agent_install_current(
        &self,
        tx: &DatabaseTransaction,
        agent: &AgentIdentity,
        platform: &str,
    ) -> Result<bool> {
        let row = tx
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                "SELECT webdock_rls.lock_plugin_install_agent($1,$2,$3) AS allowed",
                [
                    agent.cluster_id().into(),
                    agent.generation().into(),
                    platform.into(),
                ],
            ))
            .await
            .map_err(db_error)?
            .ok_or_else(error)?;
        row.try_get("", "allowed").map_err(db_error)
    }
    pub(super) fn material(&self, v: &Value) -> Result<PluginRuntimeMaterial> {
        let e = &v["execution"];
        let plugin = e["plugin_id"].as_str().ok_or_else(error)?;
        let generation = e["runtime_generation"].as_u64().ok_or_else(error)?;
        let private = &e["private_components"];
        let mut files = BTreeMap::new();
        files.insert(
            "manifest.json".into(),
            v["release"]["manifest_bytes"]
                .as_str()
                .ok_or_else(error)?
                .into(),
        );
        for file in webdock_agent_protocol::plugin::MATERIAL_FILES {
            if file == "manifest.json" {
                continue;
            }
            let key = format!("material.{file}");
            files.insert(
                file.into(),
                open_component(
                    &self.installer()?.cipher,
                    plugin,
                    generation,
                    &key,
                    &private[&key],
                )?,
            );
        }
        Ok(PluginRuntimeMaterial { files })
    }
    pub async fn poll_plugin_runtime(
        &self,
        agent: &AgentIdentity,
    ) -> Result<Option<PluginRuntimeClaim>> {
        let tx = self.controller().await?;
        fence(&tx, true).await?;
        let row=tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT o.id,o.generation FROM webdock_auth.plugin_operation o JOIN webdock_auth.plugin_install_execution e ON e.operation_id=o.id WHERE e.cluster_id=$1 AND o.phase='deploying' AND o.status IN ('pending','running') AND o.available_at<=now() AND (o.lease_until IS NULL OR o.lease_until<=now()) ORDER BY o.available_at,o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1",[agent.cluster_id().into()])).await.map_err(db_error)?;
        let Some(row) = row else {
            tx.commit().await.map_err(db_error)?;
            return Ok(None);
        };
        let id: String = row.try_get("", "id").map_err(db_error)?;
        let generation: i64 = row.try_get("", "generation").map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        let auth = match self.install_authorization(&id).await {
            Ok(auth) => auth,
            Err(e) if e.code == webdock_plugin_protocol::ErrorCode::PermissionDenied => {
                self.block_unclaimed_install(&id).await?;
                return Ok(None);
            }
            Err(e) => return Err(e),
        };
        let tx = self.controller().await?;
        fence(&tx, true).await?;
        let available=tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT id FROM webdock_auth.plugin_operation WHERE id=$1 AND status IN ('pending','running') AND phase='deploying' AND (lease_until IS NULL OR lease_until<=now())",[id.clone().into()])).await.map_err(db_error)?;
        if available.is_none() {
            return Ok(None);
        }
        let v = match self.locked_install(&tx, &id, generation).await {
            Ok(value) => value,
            Err(e) if e.code == webdock_plugin_protocol::ErrorCode::PermissionDenied => {
                tx.rollback().await.map_err(db_error)?;
                self.block_unclaimed_install(&id).await?;
                return Ok(None);
            }
            Err(e) => return Err(e),
        };
        if !self
            .agent_install_current(
                &tx,
                agent,
                v["execution"]["platform_id"].as_str().ok_or_else(error)?,
            )
            .await?
        {
            return Ok(None);
        }
        let spec: PluginRuntimeSpec = parsed(v["execution"]["spec"].clone())?;
        let token_id = uuid::Uuid::new_v4();
        let token = format!("{}{}", token_id.simple(), uuid::Uuid::new_v4().simple());
        let until = (chrono::Utc::now().timestamp() + 120) as u64;
        let lease = PluginRuntimeLease {
            operation_id: id.clone(),
            generation: generation as u64,
            token: token.clone(),
            lease_until: until,
            agent_generation: agent.generation() as u64,
            action: PluginRuntimeAction::Apply,
        };
        let checkpoint = if v["execution"]["checkpoint"].is_null() {
            None
        } else {
            Some(parsed(v["execution"]["checkpoint"].clone())?)
        };
        let claim = PluginRuntimeClaim {
            spec,
            lease,
            material: self.material(&v)?,
            checkpoint,
        };
        claim
            .validate(chrono::Utc::now().timestamp() as u64)
            .map_err(|_| error())?;
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"INSERT INTO webdock_auth.plugin_install_dispatch(operation_id,generation,token_sha256,spec_sha256,lease_sha256,agent_generation,cluster_id,platform_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[claim.lease.operation_id.clone().into(),generation.into(),digest(&token).into(),claim.spec.fingerprint().map_err(|_|error())?.into(),digest(serde_json::to_vec(&claim.lease).map_err(|_|error())?).into(),agent.generation().into(),claim.spec.cluster_id.clone().into(),claim.spec.platform_id.clone().into()])).await.map_err(db_error)?;
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"UPDATE webdock_auth.plugin_operation SET status='running',claim_token=$2::uuid,lease_until=to_timestamp($3::double precision),attempts=attempts+1,checkpoint=jsonb_build_object('sequence',coalesce((checkpoint->>'sequence')::bigint,0)+1),updated_at=now() WHERE id=$1",[id.into(),token_id.to_string().into(),(until as i64).into()])).await.map_err(db_error)?;
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"UPDATE webdock_auth.plugin_install_execution SET agent_generation=$2,agent_token_sha256=$3,updated_at=now() WHERE plugin_id=$1",[claim.spec.plugin_id.clone().into(),agent.generation().into(),digest(token).into()])).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        auth.commit().await.map_err(db_error)?;
        Ok(Some(claim))
    }
    async fn agent_install_guard(
        &self,
        tx: &DatabaseTransaction,
        agent: &AgentIdentity,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
    ) -> Result<Value> {
        spec.validate().map_err(|_| error())?;
        lease
            .current(chrono::Utc::now().timestamp() as u64)
            .map_err(|_| PluginError::denied())?;
        if lease.action != PluginRuntimeAction::Apply
            || lease.agent_generation != agent.generation() as u64
            || spec.cluster_id != agent.cluster_id()
        {
            return Err(PluginError::denied());
        }
        let v = self
            .locked_install(tx, &lease.operation_id, lease.generation as i64)
            .await?;
        let e = &v["execution"];
        if e["spec"] != json(spec)?
            || e["spec_sha256"] != spec.fingerprint().map_err(|_| error())?
            || e["agent_generation"] != agent.generation()
            || e["agent_token_sha256"] != digest(&lease.token)
            || v["operation"]["status"] != "running"
            || v["operation"]["phase"] != "deploying"
            || !self
                .agent_install_current(tx, agent, &spec.platform_id)
                .await?
        {
            return Err(PluginError::denied());
        }
        let valid=tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT id FROM webdock_auth.plugin_operation WHERE id=$1 AND lease_until>now() AND extract(epoch FROM lease_until)::bigint=$2",[lease.operation_id.clone().into(),(lease.lease_until as i64).into()])).await.map_err(db_error)?;
        if valid.is_none() {
            return Err(PluginError::denied());
        }
        Ok(v)
    }
    pub async fn guard_plugin_runtime(
        &self,
        agent: &AgentIdentity,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
    ) -> Result<bool> {
        let auth = match self.install_authorization(&lease.operation_id).await {
            Ok(auth) => auth,
            Err(e) if e.code == webdock_plugin_protocol::ErrorCode::PermissionDenied => {
                return Ok(false);
            }
            Err(e) => return Err(e),
        };
        let tx = self.controller().await?;
        match self.agent_install_guard(&tx, agent, spec, lease).await {
            Ok(_) => {
                tx.commit().await.map_err(db_error)?;
                auth.commit().await.map_err(db_error)?;
                Ok(true)
            }
            Err(e) if e.code == webdock_plugin_protocol::ErrorCode::PermissionDenied => Ok(false),
            Err(e) => Err(e),
        }
    }
    async fn recorded_install_receipt(
        &self,
        tx: &DatabaseTransaction,
        agent: &AgentIdentity,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
        kind: &str,
        body: &Value,
    ) -> Result<bool> {
        spec.validate().map_err(|_| error())?;
        lease.validate().map_err(|_| error())?;
        if spec.cluster_id != agent.cluster_id()
            || lease.agent_generation != agent.generation() as u64
            || !self
                .agent_install_current(tx, agent, &spec.platform_id)
                .await?
        {
            return Ok(false);
        }
        let hash = digest(serde_json::to_vec(body).map_err(|_| error())?);
        let row=tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT operation_id FROM webdock_auth.plugin_install_receipt WHERE operation_id=$1 AND generation=$2 AND token_sha256=$3 AND spec_sha256=$4 AND agent_generation=$5 AND kind=$6 AND body_sha256=$7 AND lease_sha256=$8",[lease.operation_id.clone().into(),(lease.generation as i64).into(),digest(&lease.token).into(),spec.fingerprint().map_err(|_|error())?.into(),agent.generation().into(),kind.into(),hash.into(),digest(serde_json::to_vec(lease).map_err(|_|error())?).into()])).await.map_err(db_error)?;
        Ok(row.is_some())
    }
    async fn record_install_receipt(
        &self,
        tx: &DatabaseTransaction,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
        kind: &str,
        body: &Value,
        disposition: &str,
    ) -> Result<()> {
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"INSERT INTO webdock_auth.plugin_install_receipt(operation_id,generation,token_sha256,spec_sha256,agent_generation,kind,body_sha256,lease_sha256,disposition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING",[lease.operation_id.clone().into(),(lease.generation as i64).into(),digest(&lease.token).into(),spec.fingerprint().map_err(|_|error())?.into(),(lease.agent_generation as i32).into(),kind.into(),digest(serde_json::to_vec(body).map_err(|_|error())?).into(),digest(serde_json::to_vec(lease).map_err(|_|error())?).into(),disposition.into()])).await.map_err(db_error)?;
        Ok(())
    }
    async fn acknowledge_obsolete_install(
        &self,
        tx: &DatabaseTransaction,
        agent: &AgentIdentity,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
        receipt: (&str, &Value),
        authority_lost: bool,
    ) -> Result<bool> {
        let (kind, body) = receipt;
        if spec.cluster_id != agent.cluster_id()
            || lease.agent_generation != agent.generation() as u64
            || !self
                .agent_install_current(tx, agent, &spec.platform_id)
                .await?
        {
            return Ok(false);
        }
        let issued=tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT operation_id FROM webdock_auth.plugin_install_dispatch WHERE operation_id=$1 AND generation=$2 AND token_sha256=$3 AND spec_sha256=$4 AND lease_sha256=$5 AND agent_generation=$6 AND cluster_id=$7 AND platform_id=$8",[lease.operation_id.clone().into(),(lease.generation as i64).into(),digest(&lease.token).into(),spec.fingerprint().map_err(|_|error())?.into(),digest(serde_json::to_vec(lease).map_err(|_|error())?).into(),agent.generation().into(),spec.cluster_id.clone().into(),spec.platform_id.clone().into()])).await.map_err(db_error)?;
        if issued.is_none() {
            return Ok(false);
        }
        let changed=tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT operation_id FROM webdock_auth.plugin_install_receipt WHERE operation_id=$1 AND generation=$2 AND token_sha256=$3 AND kind=$4 AND (kind='complete' OR disposition='obsolete')",[lease.operation_id.clone().into(),(lease.generation as i64).into(),digest(&lease.token).into(),kind.into()])).await.map_err(db_error)?;
        if changed.is_some() {
            return Ok(false);
        }
        // A recognized lease may lose authority, but its exact outbox custody still needs an ACK.
        // Do not install its checkpoint, renew it, or change a successor's operation.
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"UPDATE webdock_auth.plugin_operation o SET status='blocked',phase='blocked',claim_token=NULL,lease_until=NULL,checkpoint=jsonb_build_object('sequence',coalesce((o.checkpoint->>'sequence')::bigint,0)+1,'condition','authority_changed'),updated_at=now() FROM webdock_auth.plugin_install_execution e,webdock_auth.plugin_installation p WHERE o.id=$1 AND o.generation=$2 AND o.status='running' AND o.phase='deploying' AND (o.lease_until>now() OR $4::boolean) AND e.operation_id=o.id AND e.plugin_id=p.id AND p.generation=o.generation AND e.agent_token_sha256=$3",[lease.operation_id.clone().into(),(lease.generation as i64).into(),digest(&lease.token).into(),authority_lost.into()])).await.map_err(db_error)?;
        self.record_install_receipt(tx, spec, lease, kind, body, "obsolete")
            .await?;
        Ok(true)
    }
    pub async fn checkpoint_plugin_runtime(
        &self,
        agent: &AgentIdentity,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
        checkpoint: &PluginRuntimeCheckpoint,
    ) -> Result<bool> {
        checkpoint.validate().map_err(|_| error())?;
        self.install_callback(agent, spec, lease, checkpoint, None)
            .await
    }
    pub async fn complete_plugin_runtime(
        &self,
        agent: &AgentIdentity,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
        completion: &PluginRuntimeCompletion,
    ) -> Result<bool> {
        completion.validate().map_err(|_| error())?;
        self.install_callback(agent, spec, lease, &completion.checkpoint, Some(completion))
            .await
    }
    async fn install_callback(
        &self,
        agent: &AgentIdentity,
        spec: &PluginRuntimeSpec,
        lease: &PluginRuntimeLease,
        checkpoint: &PluginRuntimeCheckpoint,
        completion: Option<&PluginRuntimeCompletion>,
    ) -> Result<bool> {
        let auth = match self.install_authorization(&lease.operation_id).await {
            Ok(auth) => Some(auth),
            Err(e) if e.code == webdock_plugin_protocol::ErrorCode::PermissionDenied => None,
            Err(e) => return Err(e),
        };
        let tx = self.controller().await?;
        fence(&tx, true).await?;
        let kind = if completion.is_some() {
            "complete"
        } else {
            "checkpoint"
        };
        let body = match completion {
            Some(value) => json(value)?,
            None => json(checkpoint)?,
        };
        if self
            .recorded_install_receipt(&tx, agent, spec, lease, kind, &body)
            .await?
        {
            tx.commit().await.map_err(db_error)?;
            return Ok(true);
        }
        let validation = if auth.is_some() {
            self.agent_install_guard(&tx, agent, spec, lease).await
        } else {
            Err(PluginError::denied())
        };
        let v = match validation {
            Ok(value) => value,
            Err(e) if e.code == webdock_plugin_protocol::ErrorCode::PermissionDenied => {
                let acknowledged = self
                    .acknowledge_obsolete_install(
                        &tx,
                        agent,
                        spec,
                        lease,
                        (kind, &body),
                        auth.is_none(),
                    )
                    .await?;
                tx.commit().await.map_err(db_error)?;
                return Ok(acknowledged);
            }
            Err(e) => return Err(e),
        };
        if !v["execution"]["checkpoint"].is_null() {
            let previous: PluginRuntimeCheckpoint = parsed(v["execution"]["checkpoint"].clone())?;
            if !previous.agrees(checkpoint) {
                return Ok(false);
            }
        }
        self.record_install_receipt(&tx, spec, lease, kind, &body, "accepted")
            .await?;
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"UPDATE webdock_auth.plugin_install_execution SET checkpoint=$2,updated_at=now() WHERE plugin_id=$1",[spec.plugin_id.clone().into(),json(checkpoint)?.into()])).await.map_err(db_error)?;
        if let Some(completion) = completion {
            let (status, phase, condition) =
                if completion.outcome == PluginRuntimeOutcome::Succeeded {
                    ("pending", "verifying_runtime", None)
                } else {
                    ("blocked", "blocked", Some("needs_reconciliation"))
                };
            tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"UPDATE webdock_auth.plugin_operation SET status=$2,phase=$3,claim_token=NULL,lease_until=NULL,available_at=now(),checkpoint=jsonb_build_object('sequence',coalesce((checkpoint->>'sequence')::bigint,0)+1,'condition',$4::text),updated_at=now() WHERE id=$1",[lease.operation_id.clone().into(),status.into(),phase.into(),condition.into()])).await.map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        auth.ok_or_else(PluginError::denied)?
            .commit()
            .await
            .map_err(db_error)?;
        Ok(true)
    }
}
