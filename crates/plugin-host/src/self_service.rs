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
        let (inv, metadata, _) = self.persisted(&handle.claims).await?;
        let action = metadata
            .manifest
            .action(&handle.claims.action)
            .ok_or_else(PluginError::denied)?;
        let context = &inv.row["session_context"];
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
        let tx = self.controller().await?;
        let row = tx
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                "SELECT webdock_rls.record_plugin_resource($1::uuid,$2,$3,$4) AS recorded",
                [
                    inv.id.clone().into(),
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
