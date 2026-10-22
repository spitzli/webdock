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
    v["offerings"] =
        json!([{"id":"note","label":"Note","description":"A short note kept with the project."}]);
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
            ("preview", "operator", None),
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
            if label == "preview" {
                sql(&owner, "INSERT INTO webdock_auth.studio_tenant_preview(session_id,actor_id,customer_id,organization_id) VALUES($1,$2,$3,$4)", vec![format!("{uid}-session").into(), uid.clone().into(), customers[0].clone().into(), orgs[0].clone().into()]).await;
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
        for uid in &self.users {
            sql(
                o,
                "DELETE FROM webdock_auth.studio_tenant_preview WHERE actor_id=$1",
                vec![uid.clone().into()],
            )
            .await;
        }
        for table in [
            "plugin_workload",
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

use webdock_plugin_host::{AdmissionInput, FileBindings, HostService};
use webdock_plugin_runtime::PeerIdentity;

impl Fixture {
    pub async fn host(&self) -> std::sync::Arc<HostService> {
        std::sync::Arc::new(
            HostService::new(
                db("DATABASE_URL").await,
                db("WEBDOCK_PLUGIN_WORKER_DATABASE_URL").await,
                std::env::var("DATABASE_RLS_SECRET").unwrap(),
                std::sync::Arc::new(webdock_persistence::IdAllocator::new(
                    db("DATABASE_URL").await,
                    webdock_ids::Identity::platform(0, 2).unwrap(),
                )),
                std::sync::Arc::new(FileBindings::new(
                    self.bindings.path().join("bindings.json"),
                )),
                ed25519_dalek::SigningKey::from_bytes(&[23; 32]),
            )
            .await
            .unwrap(),
        )
    }
    /// Operators change policy through the API (Task 4); tests write rows and bump the revision directly.
    pub async fn set_mode(&self, mode: &str, listed: &[usize]) {
        let o = &self.owner;
        sql(o, "INSERT INTO webdock_auth.plugin_feature_policy(plugin_id,feature_id,mode,updated_by) VALUES($1,'create-notes',$2,'fixture') ON CONFLICT (plugin_id,feature_id) DO UPDATE SET mode=EXCLUDED.mode", vec![self.plugin.clone().into(), mode.into()]).await;
        sql(
            o,
            "DELETE FROM webdock_auth.plugin_feature_customer WHERE plugin_id=$1",
            vec![self.plugin.clone().into()],
        )
        .await;
        for i in listed {
            sql(o, "INSERT INTO webdock_auth.plugin_feature_customer(plugin_id,feature_id,customer_id,added_by) VALUES($1,'create-notes',$2,'fixture')", vec![self.plugin.clone().into(), self.customers[*i].clone().into()]).await;
        }
        sql(o, "UPDATE webdock_auth.plugin_installation SET policy_revision=policy_revision+1 WHERE id=$1", vec![self.plugin.clone().into()]).await;
        sql(o, "UPDATE webdock_auth.plugin_grant SET revision=(SELECT policy_revision FROM webdock_auth.plugin_installation WHERE id=$1) WHERE plugin_id=$1", vec![self.plugin.clone().into()]).await;
    }
    pub fn input(&self, project: usize, action: &str, input: Value) -> AdmissionInput {
        serde_json::from_value(json!({"pluginID":self.plugin,"projectID":self.projects[project],"action":action,"input":input,"idempotencyKey":uuid::Uuid::new_v4().to_string()})).unwrap()
    }
    pub async fn resources(&self) -> Vec<(String, String, String)> {
        self.owner
            .query_all_raw(Statement::from_sql_and_values(DbBackend::Postgres, "SELECT resource_id,project_id,created_via FROM webdock_auth.plugin_resource WHERE plugin_id=$1 ORDER BY resource_id", [self.plugin.clone().into()]))
            .await
            .unwrap()
            .iter()
            .map(|r| (r.try_get("", "resource_id").unwrap(), r.try_get("", "project_id").unwrap(), r.try_get("", "created_via").unwrap()))
            .collect()
    }
}
fn peer() -> PeerIdentity {
    PeerIdentity::Unix {
        uid: rustix::process::geteuid().as_raw(),
    }
}
/// Admit, authenticate and record a create; returns the new resource id.
async fn create(f: &Fixture, host: &HostService, who: &str, project: usize, id: &str) -> String {
    let admitted = host
        .admit(
            f.principal(who),
            f.input(project, "notes.create", json!({"name":id})),
        )
        .await
        .unwrap();
    let handle = host.authenticate(peer(), &admitted.token).await.unwrap();
    host.record_resource(&handle, &json!({"resource":{"id":id,"name":id}}))
        .await
        .unwrap();
    host.revoke(&handle).await.unwrap();
    id.into()
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn policy_matrix_for_create() {
    let f = Fixture::new().await;
    let host = f.host().await;
    // (mode, listed customers) → which actors may create on customer A's project.
    let cases: [(&str, &[usize], &[&str]); 4] = [
        ("everyone", &[], &["operator", "owner", "admin"]),
        ("selected", &[0], &["operator", "owner", "admin"]),
        ("selected", &[1], &["operator"]),
        ("assigned", &[], &["operator"]),
    ];
    for (mode, listed, allowed) in cases {
        f.set_mode(mode, listed).await;
        for who in ["operator", "owner", "admin", "member", "foreign", "preview"] {
            let result = host
                .admit(
                    f.principal(who),
                    f.input(0, "notes.create", json!({"name":"x"})),
                )
                .await;
            assert_eq!(
                result.is_ok(),
                allowed.contains(&who),
                "{mode} {listed:?} {who}"
            );
        }
    }
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn audience_and_resource_gates() {
    let f = Fixture::new().await;
    let host = f.host().await;
    f.set_mode("everyone", &[]).await;
    // operator_assigns_resource: operator creates on A, the A owner then uses it.
    let assigned = create(&f, &host, "operator", 0, "assigned-1").await;
    let foreign = create(&f, &host, "foreign", 1, "foreign-1").await;
    let mine = create(&f, &host, "owner", 0, "mine-1").await;
    assert_eq!(
        f.resources().await,
        vec![
            (assigned.clone(), f.projects[0].clone(), "operator".into()),
            (
                foreign.clone(),
                f.projects[1].clone(),
                "self-service".into()
            ),
            (mine.clone(), f.projects[0].clone(), "self-service".into()),
        ]
    );
    let view = |r: &str| json!({"resource_id": r});
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.view", view(&assigned))
        )
        .await
        .is_ok()
    );
    // member_cannot_create but may read resources of its customer.
    assert!(
        host.admit(f.principal("member"), f.input(0, "notes.view", view(&mine)))
            .await
            .is_ok()
    );
    assert!(
        host.admit(
            f.principal("member"),
            f.input(0, "notes.create", json!({"name":"m"}))
        )
        .await
        .is_err()
    );
    // resource_gate_rejects_foreign_resource: never by project mix-up, not even for operators.
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.view", view(&foreign))
        )
        .await
        .is_err()
    );
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(1, "notes.view", view(&foreign))
        )
        .await
        .is_err()
    );
    assert!(
        host.admit(
            f.principal("operator"),
            f.input(0, "notes.view", view(&foreign))
        )
        .await
        .is_err()
    );
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.view", view("missing"))
        )
        .await
        .is_err()
    );
    // Operator-only actions.
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.operator", json!({}))
        )
        .await
        .is_err()
    );
    assert!(
        host.admit(
            f.principal("operator"),
            f.input(0, "notes.operator", json!({}))
        )
        .await
        .is_ok()
    );
    // removed_customer_keeps_resources: use stays, create and feature-gated changes stop.
    f.set_mode("selected", &[1]).await;
    assert!(
        host.admit(f.principal("owner"), f.input(0, "notes.view", view(&mine)))
            .await
            .is_ok()
    );
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.rename", view(&mine))
        )
        .await
        .is_err()
    );
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.create", json!({"name":"y"}))
        )
        .await
        .is_err()
    );
    assert!(
        host.admit(
            f.principal("operator"),
            f.input(0, "notes.rename", view(&mine))
        )
        .await
        .is_ok()
    );
    // Deleting through the feature removes the index row.
    f.set_mode("everyone", &[]).await;
    let admitted = host
        .admit(
            f.principal("owner"),
            f.input(0, "notes.delete", view(&mine)),
        )
        .await
        .unwrap();
    let handle = host.authenticate(peer(), &admitted.token).await.unwrap();
    host.record_resource(&handle, &json!({})).await.unwrap();
    assert!(f.resources().await.iter().all(|(id, _, _)| id != &mine));
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn policy_change_revokes_inflight_invocation() {
    let f = Fixture::new().await;
    let host = f.host().await;
    f.set_mode("everyone", &[]).await;
    let admitted = host
        .admit(
            f.principal("owner"),
            f.input(0, "notes.create", json!({"name":"z"})),
        )
        .await
        .unwrap();
    f.set_mode("assigned", &[]).await;
    assert!(host.authenticate(peer(), &admitted.token).await.is_err());
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn create_output_requires_valid_resource() {
    let f = Fixture::new().await;
    let host = f.host().await;
    f.set_mode("everyone", &[]).await;
    for output in [
        json!({}),
        json!({"resource":{"id":"a/b","name":"x"}}),
        json!({"resource":{"id":"ok","name":""}}),
        json!({"resource":{"id":"ok"}}),
    ] {
        let admitted = host
            .admit(
                f.principal("owner"),
                f.input(0, "notes.create", json!({"name":"x"})),
            )
            .await
            .unwrap();
        let handle = host.authenticate(peer(), &admitted.token).await.unwrap();
        assert!(
            host.record_resource(&handle, &output).await.is_err(),
            "{output}"
        );
    }
    // A create action must not take a resource id from the caller.
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.create", json!({"name":"x","resource_id":"r"}))
        )
        .await
        .is_err()
    );
    assert!(f.resources().await.is_empty());
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn operator_policy_api() {
    let f = Fixture::new().await;
    let host = f.host().await;
    let op = f.principal("operator");
    // operator_sets_mode_and_list
    let view = host.self_service(op, None, &f.plugin).await.unwrap();
    assert_eq!(view["revision"], "0");
    assert_eq!(view["features"][0]["id"], "create-notes");
    assert_eq!(view["features"][0]["mode"], "assigned");
    assert_eq!(view["features"][0]["offering"], "note");
    let changed = host
        .set_feature_mode(op, None, &f.plugin, "create-notes", "selected", "0")
        .await
        .unwrap();
    assert_eq!(changed["revision"], "1");
    let changed = host
        .set_feature_customer(
            op,
            None,
            &f.plugin,
            "create-notes",
            &f.customers[0],
            true,
            "1",
        )
        .await
        .unwrap();
    assert_eq!(changed["revision"], "2");
    let view = host.self_service(op, None, &f.plugin).await.unwrap();
    assert_eq!(view["features"][0]["mode"], "selected");
    assert_eq!(
        view["features"][0]["customers"][0]["id"],
        f.customers[0].as_str()
    );
    assert!(
        host.admit(
            f.principal("owner"),
            f.input(0, "notes.create", json!({"name":"a"}))
        )
        .await
        .is_ok()
    );
    // stale_revision_conflicts
    let stale = host
        .set_feature_mode(op, None, &f.plugin, "create-notes", "everyone", "1")
        .await
        .unwrap_err();
    assert_eq!(stale.code, webdock_plugin_protocol::ErrorCode::Conflict);
    // unknown_feature_rejected
    assert!(
        host.set_feature_mode(op, None, &f.plugin, "missing", "everyone", "2")
            .await
            .is_err()
    );
    assert!(
        host.set_feature_mode(op, None, &f.plugin, "create-notes", "public", "2")
            .await
            .is_err()
    );
    assert!(
        host.set_feature_customer(op, None, &f.plugin, "create-notes", "999999999", true, "2")
            .await
            .is_err()
    );
    // customer_cannot_change_policy
    for who in ["owner", "admin", "preview"] {
        assert!(
            host.set_feature_mode(
                f.principal(who),
                None,
                &f.plugin,
                "create-notes",
                "everyone",
                "2"
            )
            .await
            .is_err(),
            "{who}"
        );
        assert!(
            host.self_service(f.principal(who), None, &f.plugin)
                .await
                .is_err(),
            "{who}"
        );
        assert!(
            host.customer_self_service(f.principal(who), None, &f.customers[0])
                .await
                .is_err(),
            "{who}"
        );
    }
    // customer_view_lists_selected_features
    let listed = host
        .customer_self_service(op, None, &f.customers[0])
        .await
        .unwrap();
    let mine: Vec<&Value> = listed
        .as_array()
        .unwrap()
        .iter()
        .filter(|v| v["plugin"] == f.plugin.as_str())
        .collect();
    assert_eq!(mine.len(), 1);
    assert_eq!(mine[0]["feature"], "create-notes");
    assert_eq!(mine[0]["mode"], "selected");
    assert_eq!(mine[0]["allowed"], true);
    let other = host
        .customer_self_service(op, None, &f.customers[1])
        .await
        .unwrap();
    assert!(
        other
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["plugin"] == f.plugin.as_str() && v["allowed"] == false)
    );
    // Removing the customer revokes its in-flight create.
    let admitted = host
        .admit(
            f.principal("owner"),
            f.input(0, "notes.create", json!({"name":"b"})),
        )
        .await
        .unwrap();
    host.set_feature_customer(
        op,
        None,
        &f.plugin,
        "create-notes",
        &f.customers[0],
        false,
        "2",
    )
    .await
    .unwrap();
    assert!(host.authenticate(peer(), &admitted.token).await.is_err());
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn index_follows_what_the_plugin_did_even_if_policy_changed_meanwhile() {
    let f = Fixture::new().await;
    let host = f.host().await;
    f.set_mode("everyone", &[]).await;
    let admitted = host
        .admit(
            f.principal("owner"),
            f.input(0, "notes.create", json!({"name":"late"})),
        )
        .await
        .unwrap();
    let handle = host.authenticate(peer(), &admitted.token).await.unwrap();
    // The plugin has created the note; the operator takes creation back before Core records it.
    f.set_mode("assigned", &[]).await;
    host.record_resource(&handle, &json!({"resource":{"id":"late-1","name":"late"}}))
        .await
        .unwrap();
    assert_eq!(
        f.resources().await.len(),
        1,
        "the created note stays visible and deletable"
    );
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn operator_lists_resources_across_customers() {
    let f = Fixture::new().await;
    let host = f.host().await;
    f.set_mode("everyone", &[]).await;
    let a = create(&f, &host, "owner", 0, &format!("a-{}", f.nonce)).await;
    let b = create(&f, &host, "foreign", 1, &format!("b-{}", f.nonce)).await;
    let list = host
        .plugin_resources(f.principal("operator"), None, &f.plugin)
        .await
        .unwrap();
    let rows = list.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    let row = rows.iter().find(|r| r["id"] == a.as_str()).unwrap();
    assert_eq!(row["customer"]["id"], f.customers[0].as_str());
    assert_eq!(row["project"]["id"], f.projects[0].as_str());
    assert!(row["project"]["name"].is_string() && row["customer"]["name"].is_string());
    assert_eq!(row["offering"], "note");
    assert_eq!(row["offeringLabel"], "Note");
    assert_eq!(row["createdVia"], "self-service");
    assert!(rows.iter().any(|r| r["id"] == b.as_str()));
    for who in ["owner", "admin", "member", "foreign", "preview"] {
        assert!(
            host.plugin_resources(f.principal(who), None, &f.plugin)
                .await
                .is_err(),
            "{who}"
        );
    }
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires local retained-schema restricted roles and signed RLS fixture"]
async fn workloads_are_pinned_and_stored_for_the_runtime() {
    let f = Fixture::new().await;
    let o = &f.owner;
    let mut manifest = product_manifest(&f.plugin);
    manifest["capabilities"] = json!(["plugin.workloads"]);
    manifest["workloads"] = json!({"kinds": ["apps/v1/Deployment", "v1/Service"]});
    let raw = manifest.to_string();
    sql(o, "UPDATE webdock_auth.plugin_release SET manifest_bytes=$2,manifest_sha256=$3 WHERE plugin_id=$1", vec![f.plugin.clone().into(), raw.clone().into(), hex::encode(Sha256::digest(raw.as_bytes())).into()]).await;
    let cluster = id(o).await;
    sql(o, "INSERT INTO webdock_auth.hosting_cluster(id,name,provider,region,location_evidence) VALUES($1,$2,'k3s','eu-central','fixture')", vec![cluster.clone().into(), format!("{}-cluster", f.nonce).into()]).await;
    let host = f.host().await;
    let service = json!([{"apiVersion":"v1","kind":"Service","metadata":{"name":"web"},"spec":{"ports":[{"port":80}]}}]);
    let apply = |project: usize| json!({"project": f.projects[project], "unit": "web-1", "objects": service});
    // Not approved yet: the capability is the operator's ceiling.
    assert!(
        host.workloads(&peer(), &f.plugin, 1, "apply", apply(0))
            .await
            .is_err()
    );
    sql(o, "UPDATE webdock_auth.plugin_configuration SET approved_capabilities='[\"plugin.workloads\"]' WHERE plugin_id=$1", vec![f.plugin.clone().into()]).await;
    // Approved, but no cluster assigned in the runtime binding.
    assert!(
        host.workloads(&peer(), &f.plugin, 1, "apply", apply(0))
            .await
            .is_err()
    );
    let path = f.bindings.path().join("bindings.json");
    let mut bindings: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    bindings["runtimes"][&f.plugin]["workloadCluster"] = json!(cluster);
    std::fs::write(&path, bindings.to_string()).unwrap();

    let first = host
        .workloads(&peer(), &f.plugin, 1, "apply", apply(0))
        .await
        .unwrap();
    assert_eq!(first["revision"], 1);
    let namespace = first["namespace"].as_str().unwrap().to_owned();
    assert!(namespace.starts_with("wd-") && namespace.ends_with(&f.projects[0]));
    assert_eq!(
        host.workloads(&peer(), &f.plugin, 1, "apply", apply(0))
            .await
            .unwrap()["revision"],
        2
    );
    let stored: Value = o.query_one_raw(Statement::from_sql_and_values(DbBackend::Postgres, "SELECT objects,cluster_id FROM webdock_auth.plugin_workload WHERE plugin_id=$1 AND unit='web-1'", [f.plugin.clone().into()])).await.unwrap().unwrap().try_get("", "objects").unwrap();
    assert_eq!(stored[0]["metadata"]["namespace"], namespace.as_str());
    assert_eq!(stored[0]["metadata"]["labels"]["webdock.dev/unit"], "web-1");
    // A unit stays in its project; other runtimes and other peers are refused.
    assert!(
        host.workloads(&peer(), &f.plugin, 1, "apply", apply(1))
            .await
            .is_err()
    );
    assert!(
        host.workloads(
            &PeerIdentity::Unix { uid: 0 },
            &f.plugin,
            1,
            "apply",
            apply(0)
        )
        .await
        .is_err()
    );
    assert!(
        host.workloads(&peer(), &f.plugin, 2, "observe", json!({"unit":"web-1"}))
            .await
            .is_err()
    );
    let observed = host
        .workloads(&peer(), &f.plugin, 1, "observe", json!({"unit":"web-1"}))
        .await
        .unwrap();
    assert_eq!(
        (
            observed["revision"].as_i64(),
            observed["appliedRevision"].as_i64()
        ),
        (Some(2), Some(0))
    );
    host.workloads(&peer(), &f.plugin, 1, "remove", json!({"unit":"web-1"}))
        .await
        .unwrap();
    let removing = host
        .workloads(&peer(), &f.plugin, 1, "observe", json!({"unit":"web-1"}))
        .await
        .unwrap();
    assert_eq!(
        (
            removing["removing"].as_bool(),
            removing["revision"].as_i64()
        ),
        (Some(true), Some(3))
    );
    // The agent reports only through its own scope; the owner session cannot fake it.
    let reported: bool = o
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            "SELECT webdock_rls.report_plugin_workload($1,'web-1',3,NULL,NULL,true) AS ok",
            [f.plugin.clone().into()],
        ))
        .await
        .unwrap()
        .unwrap()
        .try_get("", "ok")
        .unwrap();
    assert!(!reported);
    sql(
        o,
        "DELETE FROM webdock_auth.plugin_workload WHERE plugin_id=$1",
        vec![f.plugin.clone().into()],
    )
    .await;
    sql(
        o,
        "DELETE FROM webdock_auth.hosting_cluster WHERE id=$1",
        vec![cluster.into()],
    )
    .await;
    f.cleanup().await;
}
