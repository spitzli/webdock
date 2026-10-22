//! A real Stalwart CE engine through the local Docker socket (`WEBDOCK_MAIL_PLUGIN_TEST_DOCKER=1`),
//! on an internal network without a route out, and plugin storage on a disposable local PostgreSQL
//! (`WEBDOCK_MAIL_PLUGIN_TEST_ADMIN_URL`, loopback).
use serde_json::{Value, json};
use std::time::Duration;
use tokio_postgres::NoTls;
use webdock_mail::{Dns, Handler, Plugin, Settings, engine, seal::Sealer, store::Store, transport};
use webdock_plugin_protocol::{ErrorCode, InvocationClaims, PluginError};
use webdock_plugin_runtime::ActionHandler;

const IMAGE: &str = "docker.io/stalwartlabs/stalwart@sha256:74e5a7d55303ba525d939c6bf97ed4e010df7521f52d80afc22a815b66bd53f3";

fn admin_url() -> url::Url {
    let url = url::Url::parse(&std::env::var("WEBDOCK_MAIL_PLUGIN_TEST_ADMIN_URL").expect("disposable local server")).unwrap();
    assert_eq!(url.host_str(), Some("127.0.0.1"));
    url
}
async fn admin() -> tokio_postgres::Client {
    let (client, connection) = tokio_postgres::connect(admin_url().as_str(), NoTls).await.unwrap();
    tokio::spawn(connection);
    client
}
struct NoDns;
#[tonic::async_trait]
impl Dns for NoDns {
    async fn txt(&self, _: &str) -> Vec<String> {
        Vec::new()
    }
}
struct Fixture {
    handler: Handler,
    storage: String,
    project: String,
}
impl Fixture {
    async fn call(&self, project: &str, action: &str, input: Value) -> Result<Value, PluginError> {
        let claims = InvocationClaims { v: 1, id: uuid::Uuid::new_v4().to_string(), plugin_id: "mail".into(), generation: 1, action: action.into(), project_id: project.into(), iat: 0, exp: 0 };
        self.handler.invoke(&claims, "", input, json!({})).await
    }
    async fn ok(&self, action: &str, input: Value) -> Value {
        self.call(&self.project, action, input).await.unwrap_or_else(|e| panic!("{action}: {e:?}"))
    }
    async fn code(&self, action: &str, input: Value) -> ErrorCode {
        self.call(&self.project, action, input).await.unwrap_err().code
    }
}
async fn session(view: &Value, user: &str, password: &str) -> u16 {
    reqwest::Client::new()
        .get(format!("http://{}:8080/jmap/session", view["host"].as_str().unwrap()))
        .basic_auth(user, Some(password))
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

#[tokio::test]
#[ignore = "requires a disposable local PostgreSQL server and Docker"]
async fn mailbox_lifecycle() {
    assert_eq!(std::env::var("WEBDOCK_MAIL_PLUGIN_TEST_DOCKER").as_deref(), Ok("1"));
    let storage = format!("mailbox_test_{}", uuid::Uuid::new_v4().simple());
    admin().await.batch_execute(&format!("CREATE DATABASE {storage}")).await.unwrap();
    let mut url = admin_url();
    url.set_path(&storage);
    let config = engine::EngineConfig { docker_socket: "/var/run/docker.sock".into(), image: IMAGE.into() };
    let plugin = Plugin::new(
        Store::connect(url.as_str()).await.unwrap(),
        Sealer::new(&"57".repeat(32)).unwrap(),
        transport::Sender::new("http://127.0.0.1:9"),
        Box::new(NoDns),
        Settings { platform: transport::Platform::Smtp { host: "127.0.0.1".into(), port: 9 }, trust_unverified_domains: true },
        Some(engine::Engines::new(&config).unwrap()),
    );
    let project = format!("9{}", std::process::id());
    let f = Fixture { handler: Handler(plugin), storage, project };

    let domain = f.ok("domains.create", json!({"domain":"shop.example.test"})).await["resource"]["id"].as_str().unwrap().to_owned();
    for bad in ["", "Anna Smith", "a..b", "-a"] {
        assert_eq!(f.code("mailboxes.create", json!({"domain_id": domain, "local_part": bad})).await, ErrorCode::InvalidInput, "{bad:?}");
    }
    assert_eq!(f.call("202", "mailboxes.create", json!({"domain_id": domain, "local_part": "x"})).await.unwrap_err().code, ErrorCode::NotFound, "another project's domain");
    let created = f.ok("mailboxes.create", json!({"domain_id": domain, "local_part": "Anna", "name": "Anna"})).await;
    assert_eq!(created["resource"]["name"], "anna@shop.example.test");
    let mailbox = created["resource"]["id"].as_str().unwrap().to_owned();
    assert_eq!(f.code("mailboxes.create", json!({"domain_id": domain, "local_part": "anna"})).await, ErrorCode::Conflict);

    let mut view = Value::Null;
    for _ in 0..180 {
        view = f.ok("mailboxes.view", json!({"resource_id": mailbox})).await;
        if view["state"] != "creating" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    assert_eq!(view["state"], "ready", "{view}");
    assert_eq!(f.call("202", "mailboxes.view", json!({"resource_id": mailbox})).await.unwrap_err().code, ErrorCode::NotFound);
    let password = f.ok("mailboxes.credentials", json!({"resource_id": mailbox})).await["value"].as_str().unwrap().to_owned();
    assert_eq!(session(&view, "anna@shop.example.test", &password).await, 200);
    assert_eq!(session(&view, "anna@shop.example.test", "wrong").await, 401);

    // The domain shows its DKIM record once mailboxes use it, and cannot be removed under them.
    let domain_view = f.ok("domains.view", json!({"resource_id": domain})).await;
    assert!(domain_view["records"].as_array().unwrap().iter().any(|r| r["name"].as_str().unwrap().contains("._domainkey.shop.example.test")), "{domain_view}");
    assert_eq!(domain_view["mailboxes"], json!(["anna@shop.example.test"]));
    assert_eq!(f.code("domains.delete", json!({"resource_id": domain})).await, ErrorCode::Conflict);

    f.ok("mailboxes.rotate", json!({"resource_id": mailbox})).await;
    assert_eq!(session(&view, "anna@shop.example.test", &password).await, 401);
    let rotated = f.ok("mailboxes.credentials", json!({"resource_id": mailbox})).await["value"].as_str().unwrap().to_owned();
    assert_eq!(session(&view, "anna@shop.example.test", &rotated).await, 200);

    f.ok("mailboxes.delete", json!({"resource_id": mailbox})).await;
    assert_eq!(session(&view, "anna@shop.example.test", &rotated).await, 401);
    f.ok("mailboxes.delete", json!({"resource_id": mailbox})).await;
    f.ok("domains.delete", json!({"resource_id": domain})).await;

    engine::Engines::new(&config).unwrap().destroy(&f.project).await.unwrap();
    drop(f.handler);
    admin().await.batch_execute(&format!("DROP DATABASE {} WITH (FORCE)", f.storage)).await.unwrap();
}
