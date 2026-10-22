//! Mailboxes on the project's own engine, on one of the project's sending domains.
use super::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NewMailbox {
    domain_id: String,
    local_part: String,
    #[serde(default)]
    name: String,
}
pub const QUOTA_MB: i32 = 1024;
fn local(raw: &str) -> Result<String> {
    let value = raw.trim().to_ascii_lowercase();
    let parts_ok = value.split(['.', '_', '+', '-']).all(|p| {
        !p.is_empty()
            && p.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    });
    if value.is_empty() || value.len() > 64 || !parts_ok {
        return Err(invalid("Use letters, digits and . _ + - for the address"));
    }
    Ok(value)
}
impl Plugin {
    fn engines(&self) -> Result<&engine::Engines> {
        self.engines.as_ref().ok_or_else(|| {
            PluginError::new(ErrorCode::NotSupported, "Mailboxes are not available here")
        })
    }
    /// The engine's admin password, recorded the first time a project needs an engine.
    async fn engine_password(&self, project: &str) -> Result<String> {
        let id = Uuid::new_v4();
        let fresh = hex::encode(seal::random::<24>());
        let engine = self
            .store
            .engine(project, &id, &self.sealer.seal(&id, &fresh))
            .await
            .map_err(store_error)?;
        self.sealer
            .open(&engine.id, &engine.admin_sealed)
            .ok_or_else(|| unavailable("unseal", engine.id))
    }
    async fn existing_client(&self, project: &str) -> Result<Option<engine::Client>> {
        let Some(engines) = self.engines.as_ref() else {
            return Ok(None);
        };
        let Some(engine) = self.store.find_engine(project).await.map_err(store_error)? else {
            return Ok(None);
        };
        let admin = self
            .sealer
            .open(&engine.id, &engine.admin_sealed)
            .ok_or_else(|| unavailable("unseal", engine.id))?;
        Ok(engines.client(project, &admin).await.ok())
    }
    pub(crate) async fn create_mailbox(
        self: &Arc<Self>,
        claims: &InvocationClaims,
        input: Value,
    ) -> Result<Value> {
        self.engines()?;
        let input: NewMailbox = parse(input)?;
        let domain = self.domain(claims, &input.domain_id).await?;
        if !domain.verified && !self.settings.trust_unverified_domains {
            return Err(PluginError::new(
                ErrorCode::Conflict,
                "Verify the domain before adding mailboxes",
            ));
        }
        let name = input.name.trim();
        if name.chars().count() > 80 || name.chars().any(char::is_control) {
            return Err(invalid("Invalid display name"));
        }
        let id = Uuid::new_v4();
        let mailbox = store::Mailbox {
            id,
            project_id: claims.project_id.clone(),
            domain_id: domain.id,
            domain: domain.domain.clone(),
            local_part: local(&input.local_part)?,
            display_name: name.into(),
            password_sealed: self.sealer.seal(&id, &seal::password()),
            account_id: None,
            quota_mb: QUOTA_MB,
            state: "creating".into(),
            error: None,
            created_at: String::new(),
        };
        if !self
            .store
            .add_mailbox(&mailbox)
            .await
            .map_err(store_error)?
        {
            return Err(PluginError::new(
                ErrorCode::Conflict,
                "This address already exists",
            ));
        }
        let address = format!("{}@{}", mailbox.local_part, mailbox.domain);
        self.provision(mailbox);
        Ok(json!({"resource":{"id":id.to_string(),"name":address}}))
    }
    /// Runs detached: the first mailbox of a project sets up its engine, which takes a while.
    pub(crate) fn provision(self: &Arc<Self>, mailbox: store::Mailbox) {
        let plugin = Arc::clone(self);
        tokio::spawn(async move {
            let _serial = plugin.provisioning.lock().await;
            let outcome = async {
                let engines = plugin.engines().map_err(|e| e.message)?;
                let admin = plugin
                    .engine_password(&mailbox.project_id)
                    .await
                    .map_err(|e| e.message)?;
                engines
                    .provision(&mailbox.project_id, &admin)
                    .await
                    .map_err(|e| format!("engine: {e}"))?;
                plugin
                    .store
                    .engine_state(&mailbox.project_id, "ready")
                    .await
                    .map_err(|e| e.to_string())?;
                let client = engines
                    .client(&mailbox.project_id, &admin)
                    .await
                    .map_err(|e| e.to_string())?;
                let domain = client
                    .domain(&mailbox.domain)
                    .await
                    .map_err(|e| e.to_string())?;
                let password = plugin
                    .sealer
                    .open(&mailbox.id, &mailbox.password_sealed)
                    .ok_or("unseal")?;
                let quota = u64::try_from(mailbox.quota_mb).unwrap_or(0) * 1_048_576;
                client
                    .create_mailbox(&domain, &mailbox.local_part, &password, quota)
                    .await
                    .map_err(|e| e.to_string())
            }
            .await;
            let stored = match outcome {
                Ok(account) => plugin.store.mailbox_ready(&mailbox.id, &account).await,
                Err(error) => {
                    eprintln!("mail_plugin_mailbox: {error}");
                    plugin
                        .store
                        .mailbox_failed(&mailbox.id, "The mailbox could not be set up")
                        .await
                }
            };
            if let Err(error) = stored {
                eprintln!("mail_plugin_store: {error}");
            }
        });
    }
    /// Finish mailboxes interrupted by a restart.
    pub async fn resume(self: &Arc<Self>) -> std::result::Result<(), store::Error> {
        if self.engines.is_some() {
            for mailbox in self.store.creating_mailboxes().await? {
                self.provision(mailbox);
            }
        }
        Ok(())
    }
    async fn mailbox(
        &self,
        claims: &InvocationClaims,
        input: Value,
    ) -> Result<Option<store::Mailbox>> {
        let target: Target = parse(input)?;
        self.store
            .mailbox(&claims.project_id, &uuid(&target.resource_id)?)
            .await
            .map_err(store_error)
    }
    pub(crate) async fn view_mailbox(
        &self,
        claims: &InvocationClaims,
        input: Value,
    ) -> Result<Value> {
        let m = self.mailbox(claims, input).await?.ok_or_else(missing)?;
        let host = match self.engines.as_ref() {
            Some(engines) => engines
                .ip(&m.project_id)
                .await
                .map_err(|e| unavailable("engine", e))?
                .map(|ip| ip.to_string()),
            None => None,
        };
        Ok(json!({
            "address": format!("{}@{}", m.local_part, m.domain), "name": m.display_name, "state": m.state, "error": m.error,
            "host": host, "imapPort": engine::IMAP_PORT, "smtpPort": engine::SUBMISSION_PORT, "username": format!("{}@{}", m.local_part, m.domain),
            "quotaMb": m.quota_mb, "createdAt": m.created_at, "tls": "Implicit TLS, self-signed certificate (local development)",
        }))
    }
    async fn ready_mailbox(
        &self,
        claims: &InvocationClaims,
        input: Value,
    ) -> Result<(store::Mailbox, String)> {
        let m = self.mailbox(claims, input).await?.ok_or_else(missing)?;
        match &m.account_id {
            Some(account) if m.state == "ready" => {
                let account = account.clone();
                Ok((m, account))
            }
            _ => Err(PluginError::new(
                ErrorCode::Conflict,
                "The mailbox is not ready",
            )),
        }
    }
    pub(crate) async fn mailbox_password(
        &self,
        claims: &InvocationClaims,
        input: Value,
    ) -> Result<Value> {
        let (m, _) = self.ready_mailbox(claims, input).await?;
        let password = self
            .sealer
            .open(&m.id, &m.password_sealed)
            .ok_or_else(|| unavailable("unseal", m.id))?;
        Ok(json!({"value": password}))
    }
    pub(crate) async fn rotate_mailbox(
        &self,
        claims: &InvocationClaims,
        input: Value,
    ) -> Result<Value> {
        let _serial = self.provisioning.lock().await;
        let (m, account) = self.ready_mailbox(claims, input).await?;
        let password = seal::password();
        let client = self
            .existing_client(&m.project_id)
            .await?
            .ok_or_else(|| unavailable("engine", "not running"))?;
        // The admin can always set it again, so a lost store write is repaired by rotating once more.
        client
            .password(&account, &password)
            .await
            .map_err(|e| unavailable("engine", e))?;
        self.store
            .mailbox_password(&m.id, &self.sealer.seal(&m.id, &password))
            .await
            .map_err(store_error)?;
        Ok(json!({}))
    }
    pub(crate) async fn delete_mailbox(
        &self,
        claims: &InvocationClaims,
        input: Value,
    ) -> Result<Value> {
        let _serial = self.provisioning.lock().await;
        // The Core proved ownership; a mailbox already gone here is simply done.
        let Some(m) = self.mailbox(claims, input).await? else {
            return Ok(json!({}));
        };
        if let Some(account) = &m.account_id {
            let client = self
                .existing_client(&m.project_id)
                .await?
                .ok_or_else(|| unavailable("engine", "not running"))?;
            client
                .delete_mailbox(account)
                .await
                .map_err(|e| unavailable("engine", e))?;
        }
        self.store
            .delete_mailbox(&m.id)
            .await
            .map_err(store_error)?;
        Ok(json!({}))
    }
    /// DKIM record for a domain that has mailboxes on the project's engine, if the engine runs.
    pub(crate) async fn dkim(&self, project: &str, domain: &str) -> Option<(String, String)> {
        let client = self.existing_client(project).await.ok()??;
        let rows: engine::Rows<engine::Named> = client
            .call(
                "x:Domain/get",
                json!({"ids":null,"properties":["id","name"]}),
            )
            .await
            .ok()?;
        let id = rows.list.into_iter().find(|d| d.name == domain)?.id;
        client.dkim(&id).await.ok().flatten()
    }
}
