//! Self-service policy, gates and the resource index against the retained local fixture.
//! Each test creates uniquely named records and removes them; no schema reset and no provider I/O.
use sea_orm::{ConnectionTrait, Database, DatabaseConnection, DbBackend, Statement};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use webdock_identity::{CookiePolicy, IdentityService, Principal, RlsSigner};

async fn db(key: &str) -> DatabaseConnection {
    let value = std::env::var(key).expect("explicit local fixture URL");
    let parsed = url::Url::parse(&value).unwrap();
    assert!(
        matches!(parsed.host_str(), Some("localhost" | "127.0.0.1"))
            && parsed.path() == "/webdock_rls_test"
    );
    Database::connect(value).await.unwrap()
}
async fn sql(db: &impl ConnectionTrait, text: &str, values: Vec<sea_orm::Value>) {
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        text,
        values,
    ))
    .await
    .unwrap();
}
async fn id(db: &DatabaseConnection) -> String {
    db.query_one_raw(Statement::from_string(
        DbBackend::Postgres,
        "SELECT webdock_admin.next_snowflake() AS id",
    ))
    .await
    .unwrap()
    .unwrap()
    .try_get("", "id")
    .unwrap()
}

/// A v2 product manifest: offering `note`, feature `create-notes`, create/use/delete actions.
pub fn product_manifest(name: &str) -> Value {
    let mut v: Value = serde_json::from_str(include_str!(
        "../../plugin-protocol/tests/fixtures/project-notes.json"
    ))
    .unwrap();
    let resource = json!({"type":"object","additionalProperties":false,"required":["resource_id"],"properties":{"resource_id":{"type":"string","maxLength":128}}});
    v["name"] = json!(name);
    v["capabilities"] = json!([]);
    v["services"]["required"] = json!([]);
    v["jobs"] = json!([]);
    v["offerings"] = json!([{"id":"note","label":"Note"}]);
    v["selfService"] =
        json!({"features":[{"id":"create-notes","label":"Create notes","offering":"note"}]});
    v["actions"] = json!([
        {"name":"notes.create","intent":"write","audience":"customer","capabilities":[],"offering":"note","feature":"create-notes","resource":"create",
         "input":{"type":"object","additionalProperties":false,"properties":{"name":{"type":"string","maxLength":80}}}},
        {"name":"notes.view","intent":"read","audience":"customer","capabilities":[],"offering":"note","resource":"use","input":resource},
        {"name":"notes.rename","intent":"write","audience":"customer","capabilities":[],"offering":"note","feature":"create-notes","resource":"use","input":resource},
        {"name":"notes.delete","intent":"write","audience":"customer","capabilities":[],"offering":"note","feature":"create-notes","resource":"delete","input":resource},
        {"name":"notes.operator","intent":"read","audience":"operator","capabilities":[]}
    ]);
    v["areas"] = json!({
        "operator":{"pages":[{"id":"overview","label":"Overview","action":"notes.operator"}]},
        "selfService":{"pages":[{"id":"note","label":"Note","action":"notes.view","resource":true}]}
    });
    v
}

pub struct Fixture {
    pub owner: DatabaseConnection,
    pub nonce: String,
    pub plugin: String,
    pub customers: [String; 2],
    pub projects: [String; 2],
    users: Vec<String>,
    pub principals: std::collections::HashMap<&'static str, Principal>,
    pub bindings: tempfile::TempDir,
}
impl Fixture {
    /// Operator; owner, admin and member of customer A; owner of customer B.
    pub async fn new() -> Self {
        let owner = db("WEBDOCK_TEST_MIGRATION_DATABASE_URL").await;
        let nonce = format!(
            "self-service-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        );
        let plugin = nonce.clone();
        let cookies =
            CookiePolicy::new(false, "fixture-host-cookie-secret-at-least-32-bytes").unwrap();
        let identity = IdentityService::new(
            db("AUTH_DATABASE_URL").await,
            CookiePolicy::new(false, "fixture-host-cookie-secret-at-least-32-bytes").unwrap(),
        );
        let mut customers = vec![];
        let mut projects = vec![];
        let mut orgs = vec![];
        for label in ["a", "b"] {
            let cid = id(&owner).await;
            sql(
                &owner,
                "INSERT INTO webdock_admin.customers(id,name) VALUES($1,$2)",
                vec![cid.clone().into(), format!("{nonce}-{label}").into()],
            )
            .await;
            let pid = id(&owner).await;
            sql(
                &owner,
                "INSERT INTO webdock_admin.projects(id,name,customer_id) VALUES($1,$2,$3)",
                vec![
                    pid.clone().into(),
                    format!("{nonce}-{label}").into(),
                    cid.clone().into(),
                ],
            )
            .await;
            let org: String = owner
                .query_one_raw(Statement::from_sql_and_values(
                    DbBackend::Postgres,
                    "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
                    [cid.clone().into()],
                ))
                .await
                .unwrap()
                .unwrap()
                .try_get("", "organization_id")
                .unwrap();
            customers.push(cid);
            projects.push(pid);
            orgs.push(org);
        }
        let mut users = vec![];
        let mut principals = std::collections::HashMap::new();
        for (label, role, org) in [
            ("operator", "operator", None),
            ("owner", "user", Some((0, "owner"))),
            ("admin", "user", Some((0, "admin"))),
            ("member", "user", Some((0, "member"))),
            ("foreign", "user", Some((1, "owner"))),
        ] {
            let uid = format!("{nonce}-{label}");
            let sid = format!("{uid}-session");
            let token = format!("{uid}-token");
            sql(&owner, "INSERT INTO webdock_auth.\"user\"(id,name,email,\"emailVerified\",role,\"twoFactorEnabled\",\"mustChangePassword\") VALUES($1,$1,$2,true,$3,true,false)", vec![uid.clone().into(), format!("{uid}@example.invalid").into(), role.into()]).await;
            sql(&owner, "INSERT INTO webdock_auth.session(id,token,\"userId\",\"expiresAt\",\"updatedAt\") VALUES($1,$2,$3,now()+interval '1 hour',now())", vec![sid.into(), token.clone().into(), uid.clone().into()]).await;
            if role == "operator" {
                sql(&owner, "INSERT INTO webdock_admin.users(id,name,email,role,auth_subject) VALUES($1,$2,$3,'operator',$2)", vec![id(&owner).await.into(), uid.clone().into(), format!("{uid}@example.invalid").into()]).await;
            }
            if let Some((index, member_role)) = org {
                sql(&owner, "INSERT INTO webdock_auth.member(id,\"organizationId\",\"userId\",role,\"createdAt\") VALUES($1,$2,$3,$4,now())", vec![format!("{uid}-member").into(), orgs[index].clone().into(), uid.clone().into(), member_role.into()]).await;
            }
            let cookie = format!("{}={}", cookies.name(), cookies.sign(&token).unwrap());
            principals.insert(
                label,
                identity
                    .authenticate_cookie(&cookie)
                    .await
                    .unwrap()
                    .unwrap(),
            );
            users.push(uid);
        }
        let manifest = product_manifest(&plugin);
        let raw = manifest.to_string();
        let digest = hex::encode(Sha256::digest(raw.as_bytes()));
        let credential = hex::encode(Sha256::digest(b"fixture-credential"));
        let image = manifest["image"].as_str().unwrap().to_owned();
        sql(&owner, "INSERT INTO webdock_auth.plugin_installation(id,kind,state,desired_state,version,runtime,current_generation) VALUES($1,'external','enabled','enabled','1.0.0','ready',1)", vec![plugin.clone().into()]).await;
        sql(&owner, "INSERT INTO webdock_auth.plugin_release(plugin_id,version,manifest_bytes,manifest_sha256,image,registry_url,signer_key_id) VALUES($1,'1.0.0',$2,$3,$4,'https://registry.invalid','fixture')", vec![plugin.clone().into(), raw.into(), digest.into(), image.clone().into()]).await;
        sql(&owner, "INSERT INTO webdock_auth.plugin_configuration(plugin_id,approved_capabilities,configuration) VALUES($1,'[]','{}')", vec![plugin.clone().into()]).await;
        sql(&owner, "INSERT INTO webdock_auth.plugin_runtime(plugin_id,generation,version,image,status,configuration_revision,credential_hash,namespace,service_name) VALUES($1,1,'1.0.0',$2,'ready',0,$3,'fixtures','fixture-plugin')", vec![plugin.clone().into(), image.into(), credential.clone().into()]).await;
        let bindings = tempfile::tempdir().unwrap();
        let path = bindings.path().join("bindings.json");
        let config = json!({"runtimes":{plugin.clone():{"generation":1,"namespace":"fixtures","service":"fixture-plugin","credentialSha256":credential,"peers":[{"kind":"unix","uid":rustix::process::geteuid().as_raw()}],"projects":{}}}});
        std::fs::write(&path, config.to_string()).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        Self {
            owner,
            nonce,
            plugin,
            customers: [customers[0].clone(), customers[1].clone()],
            projects: [projects[0].clone(), projects[1].clone()],
            users,
            principals,
            bindings,
        }
    }
    pub fn principal(&self, label: &str) -> &Principal {
        &self.principals[label]
    }
    /// Restricted Core session role with the signed actor, as request handlers use it.
    pub async fn session(&self, label: &str) -> sea_orm::DatabaseTransaction {
        RlsSigner::new(
            std::env::var("DATABASE_RLS_SECRET").unwrap(),
            "webdock_auth_runtime",
        )
        .unwrap()
        .begin(&db("DATABASE_URL").await, self.principal(label))
        .await
        .unwrap()
    }
    pub async fn cleanup(self) {
        let o = &self.owner;
        for table in [
            "plugin_resource",
            "plugin_feature_customer",
            "plugin_feature_policy",
            "plugin_invocation",
            "plugin_grant",
            "plugin_runtime",
            "plugin_configuration",
            "plugin_release",
            "plugin_operation",
        ] {
            sql(
                o,
                &format!("DELETE FROM webdock_auth.{table} WHERE plugin_id=$1"),
                vec![self.plugin.clone().into()],
            )
            .await;
        }
        sql(
            o,
            "DELETE FROM webdock_auth.plugin_installation WHERE id=$1",
            vec![self.plugin.clone().into()],
        )
        .await;
        for pid in &self.projects {
            sql(
                o,
                "DELETE FROM webdock_admin.projects WHERE id=$1",
                vec![pid.clone().into()],
            )
            .await;
        }
        for cid in &self.customers {
            sql(
                o,
                "DELETE FROM webdock_admin.customers WHERE id=$1",
                vec![cid.clone().into()],
            )
            .await;
        }
        for uid in &self.users {
            sql(
                o,
                "DELETE FROM webdock_auth.access_event WHERE actor_id=$1",
                vec![uid.clone().into()],
            )
            .await;
            sql(
                o,
                "DELETE FROM webdock_auth.member WHERE \"userId\"=$1",
                vec![uid.clone().into()],
            )
            .await;
            sql(
                o,
                "DELETE FROM webdock_admin.users WHERE name=$1",
                vec![uid.clone().into()],
            )
            .await;
            sql(
                o,
                "DELETE FROM webdock_auth.session WHERE \"userId\"=$1",
                vec![uid.clone().into()],
            )
            .await;
            sql(
                o,
                "DELETE FROM webdock_auth.\"user\" WHERE id=$1",
                vec![uid.clone().into()],
            )
            .await;
        }
        let _ = &self.nonce;
    }
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn self_service_tables_enforce_rls() {
    let f = Fixture::new().await;
    // Owner rows for both customers exist; the customer owner of A reads only A's allow-list row.
    for cid in &f.customers {
        sql(&f.owner, "INSERT INTO webdock_auth.plugin_feature_customer(plugin_id,feature_id,customer_id,added_by) VALUES($1,'create-notes',$2,'fixture')", vec![f.plugin.clone().into(), cid.clone().into()]).await;
    }
    let tx = f.session("owner").await;
    let rows = tx
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            "SELECT customer_id FROM webdock_auth.plugin_feature_customer WHERE plugin_id=$1",
            [f.plugin.clone().into()],
        ))
        .await
        .unwrap();
    let seen: Vec<String> = rows
        .iter()
        .map(|r| r.try_get("", "customer_id").unwrap())
        .collect();
    assert_eq!(seen, vec![f.customers[0].clone()]);
    let denied = tx
        .execute_raw(Statement::from_sql_and_values(DbBackend::Postgres, "INSERT INTO webdock_auth.plugin_feature_policy(plugin_id,feature_id,mode,updated_by) VALUES($1,'create-notes','everyone','owner')", [f.plugin.clone().into()]))
        .await;
    assert!(
        denied.is_err(),
        "customers cannot change self-service policy"
    );
    tx.rollback().await.unwrap();
    let tx = f.session("owner").await;
    assert!(
        tx.query_one_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            "SELECT webdock_rls.bump_plugin_policy($1)",
            [f.plugin.clone().into()]
        ))
        .await
        .is_err(),
        "customers cannot bump the policy revision"
    );
    tx.rollback().await.unwrap();
    let tx = f.session("operator").await;
    tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres, "INSERT INTO webdock_auth.plugin_feature_policy(plugin_id,feature_id,mode,updated_by) VALUES($1,'create-notes','everyone','operator')", [f.plugin.clone().into()]))
        .await
        .unwrap();
    let revision: i64 = tx
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            "SELECT webdock_rls.bump_plugin_policy($1) AS r",
            [f.plugin.clone().into()],
        ))
        .await
        .unwrap()
        .unwrap()
        .try_get("", "r")
        .unwrap();
    assert_eq!(revision, 1);
    assert!(
        tx.execute_raw(Statement::from_sql_and_values(DbBackend::Postgres, "INSERT INTO webdock_auth.plugin_resource(plugin_id,resource_id,offering_id,customer_id,project_id,name,created_via,created_by) VALUES($1,'x','note',$2,$3,'x','operator','operator')", [f.plugin.clone().into(), f.customers[0].clone().into(), f.projects[0].clone().into()]))
            .await
            .is_err(),
        "the resource index is written only by the plugin controller"
    );
    tx.rollback().await.unwrap();
    f.cleanup().await;
}
