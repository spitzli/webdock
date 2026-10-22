//! Self-service gates: action audience, per-feature access mode and resource ownership.
use super::*;

/// Grants are an admission cache filled on first use; see `webdock_rls.ensure_plugin_grant`.
pub(crate) async fn ensure_grant(
    tx: &DatabaseTransaction,
    plugin: &str,
    project: &str,
) -> Result<()> {
    tx.query_one_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "SELECT webdock_rls.ensure_plugin_grant($1,$2)",
        [plugin.into(), project.into()],
    ))
    .await
    .map_err(db_error)?;
    Ok(())
}
/// The resource an invocation acts on, as the caller named it.
pub(crate) fn resource_input(input: &Value) -> Option<&str> {
    input.get("resource_id").and_then(Value::as_str)
}
/// Order: audience, then the feature's access mode (operators bypass it), then resource ownership.
pub(crate) async fn gate(
    tx: &DatabaseTransaction,
    operator: bool,
    action: &Value,
    plugin: &str,
    customer: &str,
    project: &str,
    resource: Option<&str>,
) -> Result<()> {
    match action["audience"].as_str() {
        Some("operator") if operator => {}
        Some("customer") => {}
        _ => return denied(),
    }
    if let Some(feature) = action["feature"].as_str()
        && !operator
        && !feature_allowed(tx, plugin, feature, customer).await?
    {
        return denied();
    }
    match (action["resource"].as_str(), resource) {
        (Some("use" | "delete"), Some(resource)) => {
            let owned = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT 1 AS owned FROM webdock_auth.plugin_resource WHERE plugin_id=$1 AND resource_id=$2 AND project_id=$3 AND customer_id=$4",[plugin.into(),resource.into(),project.into(),customer.into()])).await.map_err(db_error)?;
            if owned.is_none() {
                return denied();
            }
        }
        (Some("use" | "delete"), None) | (Some("create"), Some(_)) => return denied(),
        _ => {}
    }
    Ok(())
}
async fn feature_allowed(
    tx: &DatabaseTransaction,
    plugin: &str,
    feature: &str,
    customer: &str,
) -> Result<bool> {
    // A missing policy row means 'assigned'.
    let row = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT EXISTS(SELECT 1 FROM webdock_auth.plugin_feature_policy p WHERE p.plugin_id=$1 AND p.feature_id=$2 AND (p.mode='everyone' OR (p.mode='selected' AND EXISTS(SELECT 1 FROM webdock_auth.plugin_feature_customer c WHERE c.plugin_id=$1 AND c.feature_id=$2 AND c.customer_id=$3)))) AS allowed",[plugin.into(),feature.into(),customer.into()])).await.map_err(db_error)?.ok_or_else(PluginError::denied)?;
    row.try_get("", "allowed").map_err(db_error)
}
/// Feature ids this customer may use themselves right now.
pub(crate) async fn usable_features(
    tx: &DatabaseTransaction,
    manifest: &Manifest,
    plugin: &str,
    customer: &str,
) -> Result<Vec<String>> {
    let mut usable = Vec::new();
    for feature in manifest.features() {
        let id = string(feature, "id")?;
        if feature_allowed(tx, plugin, id, customer).await? {
            usable.push(id.to_owned());
        }
    }
    Ok(usable)
}
pub(crate) async fn project_resources(
    tx: &DatabaseTransaction,
    plugin: &str,
    project: &str,
) -> Result<Vec<Value>> {
    let rows = tx.query_all_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT jsonb_build_object('id',resource_id,'offering',offering_id,'name',name,'createdVia',created_via) AS value FROM webdock_auth.plugin_resource WHERE plugin_id=$1 AND project_id=$2 ORDER BY created_at,resource_id",[plugin.into(),project.into()])).await.map_err(db_error)?;
    rows.iter()
        .map(|r| r.try_get("", "value").map_err(db_error))
        .collect()
}
fn valid_resource(id: &str, name: &str) -> bool {
    (1..=128).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
        && (1..=160).contains(&name.chars().count())
}
impl HostService {
    /// Index the resource a finished create names, or drop the one a delete acted on. Customer,
    /// project and offering come from the persisted invocation, never from plugin output.
    pub async fn record_resource(&self, handle: &InvocationHandle, output: &Value) -> Result<()> {
        // The plugin has already acted. Only confirm this is the authenticated, unrevoked invocation;
        // a policy change or token expiry since then must not let the index drift from reality.
        let tx = self.controller().await?;
        let row = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT to_jsonb(v) AS invocation FROM webdock_auth.plugin_invocation v WHERE id=$1::uuid AND kind='action' AND revoked_at IS NULL AND plugin_id=$2 AND project_id=$3 AND name=$4 AND runtime_generation=$5",[handle.claims.id.clone().into(),handle.claims.plugin_id.clone().into(),handle.claims.project_id.clone().into(),handle.claims.action.clone().into(),(handle.claims.generation as i64).into()])).await.map_err(db_error)?.ok_or_else(PluginError::denied)?;
        let invocation: Value = row.try_get("", "invocation").map_err(db_error)?;
        let metadata = self
            .metadata(
                &tx,
                &handle.claims.plugin_id,
                Some(&handle.claims.project_id),
            )
            .await?;
        let action = metadata
            .manifest
            .action(&handle.claims.action)
            .ok_or_else(PluginError::denied)?;
        let context = &invocation["session_context"];
        let (resource, name) = match action["resource"].as_str() {
            Some("create") => {
                let resource = &output["resource"];
                match (resource["id"].as_str(), resource["name"].as_str()) {
                    (Some(id), Some(name)) if valid_resource(id, name) => (id, name),
                    _ => return Err(invalid("Plugin output must name the created resource")),
                }
            }
            Some("delete") => {
                let id = context["resourceID"]
                    .as_str()
                    .ok_or_else(PluginError::denied)?;
                (id, id)
            }
            _ => return Ok(()),
        };
        let row = tx
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                "SELECT webdock_rls.record_plugin_resource($1::uuid,$2,$3,$4) AS recorded",
                [
                    handle.claims.id.clone().into(),
                    resource.into(),
                    name.into(),
                    (context["operator"] == true).into(),
                ],
            ))
            .await
            .map_err(db_error)?
            .ok_or_else(unavailable)?;
        if !row.try_get::<bool>("", "recorded").map_err(db_error)? {
            return Err(conflict("Resource id is already in use"));
        }
        tx.commit().await.map_err(db_error)
    }
}

type Authority<'a> = Option<&'a webdock_browser_session::StoredAuthority>;
const MODES: &[&str] = &["everyone", "selected", "assigned"];
impl HostService {
    /// Operator view of one plugin's self-service features with modes and allow lists.
    pub async fn self_service(
        &self,
        actor: &Principal,
        authority: Authority<'_>,
        plugin: &str,
    ) -> Result<Value> {
        if !slug(plugin) {
            return Err(invalid("Invalid plugin"));
        }
        let guard = self.admin_guard(actor, authority, false).await?;
        let tx = self.operator_tx(actor).await?;
        let metadata = self.metadata(&tx, plugin, None).await?;
        let modes = Self::modes(&tx, plugin).await?;
        let rows = tx.query_all_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT f.feature_id,jsonb_build_object('id',c.id,'name',c.name) AS customer FROM webdock_auth.plugin_feature_customer f JOIN webdock_admin.customers c ON c.id=f.customer_id WHERE f.plugin_id=$1 ORDER BY c.name,c.id",[plugin.into()])).await.map_err(db_error)?;
        let mut features = Vec::new();
        for feature in metadata.manifest.features() {
            let id = string(feature, "id")?;
            let mut customers = Vec::new();
            for row in &rows {
                if row.try_get::<String>("", "feature_id").map_err(db_error)? == id {
                    customers.push(row.try_get::<Value>("", "customer").map_err(db_error)?);
                }
            }
            let mut view = feature.clone();
            view["mode"] = json!(modes.get(id).map_or("assigned", String::as_str));
            view["customers"] = Value::Array(customers);
            features.push(view);
        }
        let revision = integer(&metadata.installation, "policy_revision")?.to_string();
        self.admin_commit(tx, actor, authority, guard, false)
            .await?;
        Ok(json!({"revision": revision, "features": features}))
    }
    pub async fn set_feature_mode(
        &self,
        actor: &Principal,
        authority: Authority<'_>,
        plugin: &str,
        feature: &str,
        mode: &str,
        expected_revision: &str,
    ) -> Result<Value> {
        if !MODES.contains(&mode) {
            return Err(invalid("Unknown self-service mode"));
        }
        let (tx, guard) = self
            .policy_tx(actor, authority, plugin, feature, expected_revision)
            .await?;
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"INSERT INTO webdock_auth.plugin_feature_policy(plugin_id,feature_id,mode,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT (plugin_id,feature_id) DO UPDATE SET mode=EXCLUDED.mode,updated_by=EXCLUDED.updated_by,updated_at=now()",[plugin.into(),feature.into(),mode.into(),actor.user_id.clone().into()])).await.map_err(db_error)?;
        self.policy_commit(tx, guard, actor, authority, plugin, "plugin.feature.mode")
            .await
    }
    #[expect(
        clippy::too_many_arguments,
        reason = "Explicit authority, target and revision inputs keep the policy boundary auditable."
    )]
    pub async fn set_feature_customer(
        &self,
        actor: &Principal,
        authority: Authority<'_>,
        plugin: &str,
        feature: &str,
        customer: &str,
        allowed: bool,
        expected_revision: &str,
    ) -> Result<Value> {
        if customer.is_empty()
            || customer.len() > 20
            || !customer.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(invalid("Invalid customer"));
        }
        let (tx, guard) = self
            .policy_tx(actor, authority, plugin, feature, expected_revision)
            .await?;
        if allowed {
            let known = tx
                .query_one_raw(Statement::from_sql_and_values(
                    DbBackend::Postgres,
                    "SELECT 1 AS known FROM webdock_admin.customers WHERE id=$1",
                    [customer.into()],
                ))
                .await
                .map_err(db_error)?;
            if known.is_none() {
                return Err(PluginError::new(
                    webdock_plugin_protocol::ErrorCode::NotFound,
                    "Customer not found",
                ));
            }
            tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"INSERT INTO webdock_auth.plugin_feature_customer(plugin_id,feature_id,customer_id,added_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[plugin.into(),feature.into(),customer.into(),actor.user_id.clone().into()])).await.map_err(db_error)?;
        } else {
            tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres,"DELETE FROM webdock_auth.plugin_feature_customer WHERE plugin_id=$1 AND feature_id=$2 AND customer_id=$3",[plugin.into(),feature.into(),customer.into()])).await.map_err(db_error)?;
        }
        self.policy_commit(
            tx,
            guard,
            actor,
            authority,
            plugin,
            "plugin.feature.customer",
        )
        .await
    }
    /// Every feature of every enabled plugin with its mode, and whether this customer is on its list.
    pub async fn customer_self_service(
        &self,
        actor: &Principal,
        authority: Authority<'_>,
        customer: &str,
    ) -> Result<Value> {
        let guard = self.admin_guard(actor, authority, false).await?;
        let tx = self.operator_tx(actor).await?;
        let ids = tx.query_all_raw(Statement::from_string(DbBackend::Postgres,"SELECT id FROM webdock_auth.plugin_installation WHERE kind='external' AND state='enabled' ORDER BY id")).await.map_err(db_error)?;
        let mut out = Vec::new();
        for row in ids {
            let plugin: String = row.try_get("", "id").map_err(db_error)?;
            let Ok(metadata) = self.metadata(&tx, &plugin, None).await else {
                continue;
            };
            let modes = Self::modes(&tx, &plugin).await?;
            let listed = tx.query_all_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT feature_id FROM webdock_auth.plugin_feature_customer WHERE plugin_id=$1 AND customer_id=$2",[plugin.clone().into(),customer.into()])).await.map_err(db_error)?
                .iter().map(|r| r.try_get::<String>("", "feature_id").map_err(db_error)).collect::<Result<Vec<_>>>()?;
            for feature in metadata.manifest.features() {
                let id = string(feature, "id")?;
                out.push(json!({"plugin":plugin,"pluginRevision":integer(&metadata.installation,"policy_revision")?.to_string(),"feature":id,"label":feature["label"],"mode":modes.get(id).map_or("assigned", String::as_str),"allowed":listed.iter().any(|l| l == id)}));
            }
        }
        self.admin_commit(tx, actor, authority, guard, false)
            .await?;
        Ok(Value::Array(out))
    }
    /// Operator view of every resource of one plugin, across customers, from the Core index.
    pub async fn plugin_resources(
        &self,
        actor: &Principal,
        authority: Authority<'_>,
        plugin: &str,
    ) -> Result<Value> {
        if !slug(plugin) {
            return Err(invalid("Invalid plugin"));
        }
        let guard = self.admin_guard(actor, authority, false).await?;
        let tx = self.operator_tx(actor).await?;
        // ponytail: newest 1000; paginate when an installation outgrows it.
        let rows = tx.query_all_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT jsonb_build_object('id',r.resource_id,'offering',r.offering_id,'name',r.name,'createdVia',r.created_via,'createdAt',r.created_at,'customer',jsonb_build_object('id',c.id,'name',c.name),'project',jsonb_build_object('id',p.id,'name',p.name)) AS value FROM webdock_auth.plugin_resource r JOIN webdock_admin.projects p ON p.id=r.project_id JOIN webdock_admin.customers c ON c.id=r.customer_id WHERE r.plugin_id=$1 ORDER BY r.created_at DESC,r.resource_id LIMIT 1000",[plugin.into()])).await.map_err(db_error)?;
        let rows = rows
            .iter()
            .map(|r| r.try_get("", "value").map_err(db_error))
            .collect::<Result<Vec<Value>>>()?;
        self.admin_commit(tx, actor, authority, guard, false)
            .await?;
        Ok(Value::Array(rows))
    }
    async fn modes(
        tx: &DatabaseTransaction,
        plugin: &str,
    ) -> Result<std::collections::HashMap<String, String>> {
        let rows = tx
            .query_all_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                "SELECT feature_id,mode FROM webdock_auth.plugin_feature_policy WHERE plugin_id=$1",
                [plugin.into()],
            ))
            .await
            .map_err(db_error)?;
        rows.iter()
            .map(|r| {
                Ok((
                    r.try_get("", "feature_id").map_err(db_error)?,
                    r.try_get("", "mode").map_err(db_error)?,
                ))
            })
            .collect()
    }
    /// Revision CAS and feature existence; the caller applies its change, then `policy_commit`.
    async fn policy_tx(
        &self,
        actor: &Principal,
        authority: Authority<'_>,
        plugin: &str,
        feature: &str,
        expected_revision: &str,
    ) -> Result<(DatabaseTransaction, Option<DatabaseTransaction>)> {
        if !slug(plugin) || !crate::data::revision(expected_revision) {
            return Err(invalid("Invalid self-service command"));
        }
        let guard = self.admin_guard(actor, authority, true).await?;
        let tx = self.operator_tx(actor).await?;
        let metadata = self.metadata(&tx, plugin, None).await?;
        if metadata.manifest.feature(feature).is_none() {
            return Err(invalid("Unknown self-service feature"));
        }
        let current = tx.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres,"SELECT policy_revision::text AS revision FROM webdock_auth.plugin_installation WHERE id=$1 FOR UPDATE",[plugin.into()])).await.map_err(db_error)?.ok_or_else(PluginError::denied)?.try_get::<String>("","revision").map_err(db_error)?;
        if current != expected_revision {
            return Err(conflict("Self-service settings changed"));
        }
        Ok((tx, guard))
    }
    /// Bump the revision (revoking in-flight invocations), audit and commit.
    async fn policy_commit(
        &self,
        tx: DatabaseTransaction,
        guard: Option<DatabaseTransaction>,
        actor: &Principal,
        authority: Authority<'_>,
        plugin: &str,
        audit: &str,
    ) -> Result<Value> {
        let revision: i64 = tx
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                "SELECT webdock_rls.bump_plugin_policy($1) AS revision",
                [plugin.into()],
            ))
            .await
            .map_err(db_error)?
            .ok_or_else(unavailable)?
            .try_get("", "revision")
            .map_err(db_error)?;
        self.audit_admin(&tx, actor, audit, plugin).await?;
        self.admin_commit(tx, actor, authority, guard, true).await?;
        Ok(json!({"revision": revision.to_string()}))
    }
}
