use crate::{
    Result,
    contracts::{self, DIMENSIONS, amount},
    environment::Environment,
    error,
};
use hmac::{Hmac, Mac};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, Statement,
    TransactionTrait, Value as SqlValue,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use webdock_identity::{Principal, RlsSigner};
use webdock_persistence::IdAllocator;
#[derive(Clone, Copy)]
pub struct HostingCeiling {
    pub read: bool,
    pub write: bool,
}
impl Default for HostingCeiling {
    fn default() -> Self {
        Self {
            read: true,
            write: true,
        }
    }
}
pub struct HostingService {
    db: DatabaseConnection,
    auth: DatabaseConnection,
    worker: DatabaseConnection,
    signer: RlsSigner,
    rls_secret: String,
    environment: Environment,
    ids: Arc<IdAllocator>,
    browser_authority: Option<Arc<browser_authority::BrowserVerifier>>,
}
// Internal actor is either a live browser principal or a persisted, validated Git release.
struct HostingActor {
    user_id: String,
    session_id: String,
    git_release: Option<String>,
}
impl From<&Principal> for HostingActor {
    fn from(p: &Principal) -> Self {
        Self {
            user_id: p.user_id.clone(),
            session_id: p.session_id.clone(),
            git_release: None,
        }
    }
}
#[derive(Clone)]
struct Access {
    customer: String,
    project: Value,
    operator: bool,
    live: bool,
    can_write: bool,
}
#[derive(Clone)]
pub struct AgentIdentity {
    cluster: String,
    generation: i32,
    credential_hash: String,
}
impl AgentIdentity {
    pub fn cluster_id(&self) -> &str {
        &self.cluster
    }
    pub fn generation(&self) -> i32 {
        self.generation
    }
}
fn db_error(_: sea_orm::DbErr) -> crate::HostingError {
    error(
        503,
        "Hosting is unavailable. Check the current state before retrying.",
    )
}
async fn one(
    db: &impl ConnectionTrait,
    sql: &str,
    values: Vec<SqlValue>,
) -> Result<Option<sea_orm::QueryResult>> {
    db.query_one_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        sql,
        values,
    ))
    .await
    .map_err(db_error)
}
async fn rows(db: &impl ConnectionTrait, sql: &str, values: Vec<SqlValue>) -> Result<Vec<Value>> {
    db.query_all_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        sql,
        values,
    ))
    .await
    .map_err(db_error)?
    .into_iter()
    .map(|row| row.try_get("", "value").map_err(db_error))
    .collect()
}
async fn execute(db: &impl ConnectionTrait, sql: &str, values: Vec<SqlValue>) -> Result<u64> {
    Ok(db
        .execute_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            sql,
            values,
        ))
        .await
        .map_err(db_error)?
        .rows_affected())
}
fn field<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value[key]
        .as_str()
        .ok_or_else(|| error(503, "Stored hosting state is invalid."))
}
fn numeric(value: &Value, key: &str) -> Result<i64> {
    value[key]
        .as_i64()
        .or_else(|| {
            value[key]
                .as_f64()
                .filter(|v| v.fract() == 0.0 && *v >= 0.0 && *v <= contracts::MAX_SAFE as f64)
                .map(|v| v as i64)
        })
        .ok_or_else(|| error(503, "Stored hosting state is invalid."))
}
fn now() -> i64 {
    chrono::Utc::now().timestamp()
}
fn epoch(value: &Value) -> Option<i64> {
    value
        .as_str()
        .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
        .map(|v| v.timestamp())
}
fn timestamp(value: &Value) -> Value {
    value
        .as_str()
        .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
        .map(|v| {
            json!(
                v.to_utc()
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
            )
        })
        .unwrap_or(Value::Null)
}
impl HostingService {
    pub async fn new(
        db: DatabaseConnection,
        auth: DatabaseConnection,
        worker: DatabaseConnection,
        rls_secret: String,
        environment_secret: String,
        ids: Arc<IdAllocator>,
    ) -> Result<Self> {
        for (connection, role) in [
            (&db, "webdock_auth_runtime"),
            (&auth, "webdock_auth_bootstrap"),
            (&worker, "webdock_worker_runtime"),
        ] {
            webdock_persistence::connection::verify_runtime_role(connection, role)
                .await
                .map_err(|_| error(503, "Restricted hosting database roles are required."))?;
        }
        let signer = RlsSigner::new(rls_secret.clone(), "webdock_auth_runtime")
            .map_err(|_| error(503, "Invalid RLS configuration."))?;
        Ok(Self {
            db,
            auth,
            worker,
            signer,
            rls_secret,
            environment: Environment::new(environment_secret)?,
            ids,
            browser_authority: None,
        })
    }
    async fn id(&self) -> Result<String> {
        Ok(self
            .ids
            .allocate()
            .await
            .map_err(|_| error(503, "ID allocation unavailable."))?
            .to_string())
    }
    async fn begin(&self, actor: &Principal) -> Result<DatabaseTransaction> {
        let tx = self
            .signer
            .begin(&self.db, actor)
            .await
            .map_err(|_| error(401, "Sign in and complete account setup."))?;
        one(&tx,"SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)",vec![]).await?;
        Ok(tx)
    }
    async fn module(tx: &DatabaseTransaction, write: bool, continuation: bool) -> Result<()> {
        one(
            tx,
            "SELECT pg_advisory_xact_lock_shared(hashtext('webdock-plugin-installation'))",
            vec![],
        )
        .await?;
        let row = one(
            tx,
            "SELECT state FROM webdock_auth.plugin_installation WHERE id='hosting'",
            vec![],
        )
        .await?
        .ok_or_else(|| error(503, "Hosting installation is unavailable."))?;
        let state: String = row.try_get("", "state").map_err(db_error)?;
        if state == "disabled" || (state == "draining" && write && !continuation) {
            return Err(error(503, "Hosting is disabled or draining."));
        }
        Ok(())
    }
    async fn authorize(
        tx: &DatabaseTransaction,
        actor: &HostingActor,
        project: Option<&str>,
        customer: Option<&str>,
        write: bool,
        operator: bool,
        live: bool,
    ) -> Result<Access> {
        if let Some(release) = &actor.git_release {
            return Self::authorize_git(
                tx, actor, release, project, customer, write, operator, live,
            )
            .await;
        }
        let identity: Value = one(tx, "SELECT webdock_rls.actor() AS actor", vec![])
            .await?
            .ok_or_else(|| error(401, "Authentication required."))?
            .try_get::<Option<Value>>("", "actor")
            .map_err(db_error)?
            .ok_or_else(|| error(401, "Sign in and complete account setup."))?;
        if identity["subject"] != actor.user_id || identity["sessionID"] != actor.session_id {
            return Err(error(401, "Identity mismatch."));
        }
        let is_operator = identity["operator"] == true;
        let preview = !identity["preview"].is_null();
        if preview && (write || operator || live) {
            return Err(error(403, "Customer preview is read-only."));
        }
        if operator && !is_operator {
            return Err(error(403, "Platform operator access is required."));
        }
        let mut target = Value::Null;
        let mut customer = customer.map(str::to_owned);
        if let Some(project) = project {
            contracts::record_id(project)?;
            one(
                tx,
                "SELECT webdock_admin.lock_hosting_project($1)",
                vec![project.into()],
            )
            .await?;
            target=rows(tx,"SELECT to_jsonb(p)||coalesce(to_jsonb(h),'{}'::jsonb) AS value FROM webdock_admin.projects p LEFT JOIN webdock_auth.hosting_project h ON h.project_id=p.id WHERE p.id=$1 AND p.status='active' AND NOT EXISTS(SELECT 1 FROM webdock_admin.project_deletion d WHERE d.project_id=p.id AND d.status<>'deleted')",vec![project.into()]).await?.pop().ok_or_else(||error(404,"Hosting target is unavailable."))?;
            let owner = field(&target, "customer_id")?;
            if customer.as_ref().is_some_and(|c| c != owner) {
                return Err(error(404, "Hosting target is unavailable."));
            }
            customer = Some(owner.into());
        }
        let mut can_write = is_operator;
        if let Some(customer) = &customer {
            contracts::record_id(customer)?;
            let row=one(tx,"SELECT webdock_rls.customer_allowed(c.id,false) AS allowed,webdock_rls.customer_permission(c.id,'org:projects:manage') AS can_write FROM webdock_admin.customers c JOIN webdock_auth.tenant_customer t ON t.customer_id=c.id WHERE c.id=$1 AND c.status='active' FOR SHARE OF c",vec![customer.clone().into()]).await?.ok_or_else(||error(404,"Hosting target is unavailable."))?;
            if !row.try_get::<bool>("", "allowed").map_err(db_error)? {
                return Err(error(404, "Hosting target is unavailable."));
            }
            can_write = row.try_get("", "can_write").map_err(db_error)?;
            if write && (!can_write || (!is_operator && target["mode"] != "selfservice")) {
                return Err(error(
                    403,
                    "This hosting action is managed by your operator.",
                ));
            }
        } else if !is_operator {
            return Err(error(403, "Choose an authorized hosting customer."));
        }
        Ok(Access {
            customer: customer.unwrap_or_default(),
            project: target,
            operator: is_operator,
            live: !preview,
            can_write: !preview && can_write,
        })
    }
    async fn lock(tx: &DatabaseTransaction, key: String) -> Result<()> {
        one(
            tx,
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            vec![key.into()],
        )
        .await?;
        Ok(())
    }
    async fn audit(
        &self,
        tx: &DatabaseTransaction,
        subject: &str,
        action: &str,
        target: &str,
        outcome: &str,
    ) -> Result<()> {
        execute(tx,"INSERT INTO webdock_auth.hosting_audit(id,subject,action,target_id,outcome) VALUES($1,$2,$3,$4,$5)",vec![self.id().await?.into(),subject.into(),action.into(),target.into(),outcome.into()]).await?;
        Ok(())
    }
    pub async fn execute(&self, actor: &Principal, input: Value) -> Result<Value> {
        self.execute_with_ceiling(actor, input, HostingCeiling::default())
            .await
    }
    pub async fn execute_with_ceiling(
        &self,
        actor: &Principal,
        input: Value,
        ceiling: HostingCeiling,
    ) -> Result<Value> {
        self.execute_guarded(actor, input, ceiling, None).await
    }
    /// Preserve the token ceiling and live access record through the domain commit.
    pub async fn execute_with_mcp(
        &self,
        oauth: &Arc<webdock_oauth::OAuthService>,
        actor: &webdock_oauth::McpAuthentication,
        input: Value,
    ) -> Result<Value> {
        if actor.authority.registry_scope() {
            return Err(error(403, "Hosting scope is required."));
        }
        let guard = oauth
            .begin_mcp_authority(&actor.authority)
            .await
            .map_err(|_| error(403, "Hosting authorization is no longer valid."))?;
        self.execute_guarded(
            guard.principal(),
            input,
            HostingCeiling {
                read: true,
                write: guard.can_write(),
            },
            Some(&guard),
        )
        .await
    }
    async fn execute_guarded(
        &self,
        actor: &Principal,
        input: Value,
        ceiling: HostingCeiling,
        guard: Option<&webdock_oauth::McpGuard>,
    ) -> Result<Value> {
        let cmd = contracts::parse_command(input)?;
        let action = field(&cmd, "action")?;
        let read = action.ends_with(".get")
            || action.ends_with(".list")
            || [
                "apps.logs",
                "apps.inspect",
                "apps.metrics",
                "apps.deletion",
                "apps.storageDeletion",
                "operations.overview",
                "usage.get",
            ]
            .contains(&action);
        if !ceiling.read || (!read && !ceiling.write) {
            return Err(error(403, "Hosting scope is required."));
        }
        let tx = self.begin(actor).await?;
        let actor = &HostingActor::from(actor);
        Self::module(&tx, !read, false).await?;
        let (result, target) = if action.starts_with("apps.") {
            self.apps(&tx, actor, &cmd).await?
        } else {
            self.management(&tx, actor, &cmd).await?
        };
        Self::authorize(
            &tx,
            actor,
            target.project.as_deref(),
            target.customer.as_deref(),
            target.write,
            target.operator,
            target.live,
        )
        .await?;
        if let Some(guard) = guard {
            guard
                .verify()
                .await
                .map_err(|_| error(403, "Hosting authorization is no longer valid."))?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
    async fn apply_scope(
        &self,
        tx: &DatabaseTransaction,
        audience: &str,
        scope: Value,
    ) -> Result<()> {
        let raw = json!({"v":1,"aud":audience,"exp":now()+60,"scope":scope}).to_string();
        let mut mac = Hmac::<Sha256>::new_from_slice(self.rls_secret.as_bytes())
            .map_err(|_| error(503, "Invalid RLS configuration."))?;
        mac.update(raw.as_bytes());
        one(tx,"SELECT set_config('webdock.rls_context',$1,true),set_config('webdock.rls_signature',$2,true)",vec![raw.into(),hex::encode(mac.finalize().into_bytes()).into()]).await?;
        Ok(())
    }
}
struct Target {
    project: Option<String>,
    customer: Option<String>,
    write: bool,
    operator: bool,
    live: bool,
}
impl Target {
    fn project(id: &str, write: bool, operator: bool, live: bool) -> Self {
        Self {
            project: Some(id.into()),
            customer: None,
            write,
            operator,
            live,
        }
    }
    fn operator(write: bool) -> Self {
        Self {
            project: None,
            customer: None,
            write,
            operator: true,
            live: false,
        }
    }
}
#[path = "agent.rs"]
mod agent;
#[path = "apps.rs"]
mod apps;
#[path = "capacity.rs"]
mod capacity;
#[path = "management.rs"]
mod management;
#[path = "runtime.rs"]
mod runtime;

#[path = "git.rs"]
mod git;

fn is_read_action(action: &str) -> bool {
    matches!(action, "apps.logs" | "apps.inspect" | "apps.metrics")
}
#[path = "reads.rs"]
mod reads;

/// Retained v1 command canonicalization: en-US ICU collation and ECMAScript JSON encoding.
pub fn canonical_command(value: &Value) -> Result<String> {
    management::canonical(value)
}

#[path = "browser_authority.rs"]
mod browser_authority;

#[path = "delivery.rs"]
mod delivery;
pub use delivery::{DeliveryCommand, DeliveryDisposition};

#[path = "completion_deadline.rs"]
mod completion_deadline;
