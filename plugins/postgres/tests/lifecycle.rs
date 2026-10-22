//! Real PostgreSQL, no Core: a disposable local server named by
//! `WEBDOCK_POSTGRES_PLUGIN_TEST_ADMIN_URL` (loopback only) holds plugin storage and shared databases.
//! Dedicated instances additionally need Docker and `WEBDOCK_POSTGRES_PLUGIN_TEST_DOCKER=1`.
use serde_json::{Value, json};
use tokio_postgres::NoTls;
use webdock_plugin_protocol::{ErrorCode, InvocationClaims, Manifest};
use webdock_plugin_runtime::ActionHandler;
use webdock_postgres::{
    Handler, Plugin, dedicated, seal::Sealer, shared::SharedServer, store::Store,
};

fn admin_url() -> url::Url {
    let url = url::Url::parse(
        &std::env::var("WEBDOCK_POSTGRES_PLUGIN_TEST_ADMIN_URL").expect("disposable local server"),
    )
    .unwrap();
    assert_eq!(url.host_str(), Some("127.0.0.1"));
    url
}
async fn admin() -> tokio_postgres::Client {
    let (client, connection) = tokio_postgres::connect(admin_url().as_str(), NoTls)
        .await
        .unwrap();
    tokio::spawn(connection);
    client
}
struct Fixture {
    handler: Handler,
    storage: String,
}
async fn fixture(capacity: u32, docker: bool) -> Fixture {
    let storage = format!("plugin_test_{}", uuid::Uuid::new_v4().simple());
    admin()
        .await
        .batch_execute(&format!("CREATE DATABASE {storage}"))
        .await
        .unwrap();
    let mut url = admin_url();
    url.set_path(&storage);
    let base = admin_url();
    let server = SharedServer {
        id: "test".into(),
        label: "Test server".into(),
        host: "127.0.0.1".into(),
        port: base.port().unwrap(),
        admin_url: base.to_string(),
        capacity,
    };
    // Parallel tests harden the same server; concurrent catalog updates may collide once.
    for attempt in 0.. {
        match server.harden().await {
            Ok(()) => break,
            Err(_) if attempt < 5 => {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await
            }
            Err(error) => panic!("{error}"),
        }
    }
    let placement = docker.then(|| {
        dedicated::Placement::new(&dedicated::DedicatedConfig {
            docker_socket: "/var/run/docker.sock".into(),
            bind_host: "127.0.0.1".into(),
        })
        .unwrap()
    });
    let plugin = Plugin::new(
        Store::connect(url.as_str()).await.unwrap(),
        Sealer::new(&"42".repeat(32)).unwrap(),
        vec![server],
        placement,
    );
    plugin.resume().await.unwrap();
    Fixture {
        handler: Handler(plugin),
        storage,
    }
}
impl Fixture {
    async fn call(
        &self,
        project: &str,
        action: &str,
        input: Value,
    ) -> Result<Value, webdock_plugin_protocol::PluginError> {
        let claims = InvocationClaims {
            v: 1,
            id: uuid::Uuid::new_v4().to_string(),
            plugin_id: "postgres".into(),
            generation: 1,
            action: action.into(),
            project_id: project.into(),
            iat: 0,
            exp: 0,
        };
        self.handler.invoke(&claims, "", input, json!({})).await
    }
    async fn ok(&self, project: &str, action: &str, input: Value) -> Value {
        self.call(project, action, input)
            .await
            .unwrap_or_else(|e| panic!("{action}: {e:?}"))
    }
    async fn cleanup(self) {
        drop(self.handler);
        admin()
            .await
            .batch_execute(&format!("DROP DATABASE {} WITH (FORCE)", self.storage))
            .await
            .unwrap();
    }
}
async fn connect(uri: &str) -> Result<tokio_postgres::Client, tokio_postgres::Error> {
    let (client, connection) = tokio_postgres::connect(uri, NoTls).await?;
    tokio::spawn(connection);
    Ok(client)
}
fn id(created: &Value) -> Value {
    json!({"resource_id": created["resource"]["id"]})
}

#[test]
fn shipped_manifest_is_the_reviewed_contract() {
    let manifest = Manifest::parse(include_bytes!("../manifest.json")).unwrap();
    webdock_postgres::validate_manifest(&manifest).unwrap();
}

#[tokio::test]
#[ignore = "requires a disposable local PostgreSQL server"]
async fn shared_database_lifecycle() {
    let f = fixture(10, false).await;
    let created = f
        .ok("101", "databases.create", json!({"name":" Orders "}))
        .await;
    assert_eq!(created["resource"]["name"], "Orders");
    let view = f.ok("101", "databases.view", id(&created)).await;
    assert_eq!(view["state"], "ready");
    assert_eq!(view["offering"], "shared");
    assert_eq!(view["server"], "Test server");
    let secret = f.ok("101", "databases.credentials", id(&created)).await;
    let uri = secret["uri"].as_str().unwrap().to_owned();
    let client = connect(&uri).await.unwrap();
    client
        .batch_execute("CREATE TABLE t(x int); INSERT INTO t VALUES (1)")
        .await
        .unwrap();

    // Another project cannot see it; another customer's role cannot open it.
    assert_eq!(
        f.call("202", "databases.view", id(&created))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    let other = f
        .ok("202", "databases.create", json!({"name":"Other"}))
        .await;
    let other_uri = f.ok("202", "databases.credentials", id(&other)).await["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    let foreign =
        other_uri.rsplit_once('/').unwrap().0.to_owned() + "/" + view["database"].as_str().unwrap();
    assert!(
        connect(&foreign).await.is_err(),
        "no CONNECT on another customer's database"
    );
    let postgres = other_uri.rsplit_once('/').unwrap().0.to_owned() + "/postgres";
    assert!(
        connect(&postgres).await.is_err(),
        "no CONNECT on the maintenance database"
    );

    // Rotation retires the old password.
    f.ok("101", "databases.rotate", id(&created)).await;
    assert!(connect(&uri).await.is_err());
    let rotated = f.ok("101", "databases.credentials", id(&created)).await["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    connect(&rotated).await.unwrap();

    // The shared delete only deletes shared databases, and removes database and role.
    assert_eq!(
        f.call("101", "instances.delete", id(&created))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    drop(client);
    f.ok("101", "databases.delete", id(&created)).await;
    assert_eq!(
        f.call("101", "databases.view", id(&created))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    let gone = admin()
        .await
        .query_one(
            "SELECT count(*) FROM pg_database WHERE datname=$1",
            &[&view["database"].as_str().unwrap()],
        )
        .await
        .unwrap();
    assert_eq!(gone.get::<_, i64>(0), 0);
    let gone = admin()
        .await
        .query_one(
            "SELECT count(*) FROM pg_roles WHERE rolname=$1",
            &[&view["user"].as_str().unwrap()],
        )
        .await
        .unwrap();
    assert_eq!(gone.get::<_, i64>(0), 0);
    f.ok("202", "databases.delete", id(&other)).await;
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires a disposable local PostgreSQL server"]
async fn capacity_inputs_and_missing_placement() {
    let f = fixture(1, false).await;
    let first = f.ok("101", "databases.create", json!({"name":"one"})).await;
    assert_eq!(
        f.call("101", "databases.create", json!({"name":"two"}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Unavailable
    );
    for input in [
        json!({"name":""}),
        json!({"name":"x".repeat(64)}),
        json!({"name":"a","extra":1}),
        json!({}),
    ] {
        assert_eq!(
            f.call("101", "databases.create", input.clone())
                .await
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput,
            "{input}"
        );
    }
    assert_eq!(
        f.call("101", "databases.view", json!({"resource_id":"not-a-uuid"}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    assert_eq!(
        f.call(
            "101",
            "instances.create",
            json!({"name":"x","version":"18"})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotSupported
    );
    f.ok("101", "databases.delete", id(&first)).await;
    f.cleanup().await;
}

#[tokio::test]
#[ignore = "requires a disposable local PostgreSQL server and Docker"]
async fn dedicated_instance_lifecycle() {
    assert_eq!(
        std::env::var("WEBDOCK_POSTGRES_PLUGIN_TEST_DOCKER").as_deref(),
        Ok("1")
    );
    let f = fixture(0, true).await;
    assert_eq!(
        f.call(
            "101",
            "instances.create",
            json!({"name":"x","version":"16"})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::InvalidInput
    );
    let created = f
        .ok(
            "101",
            "instances.create",
            json!({"name":"Analytics","version":"18"}),
        )
        .await;
    let mut view = Value::Null;
    for _ in 0..240 {
        view = f.ok("101", "databases.view", id(&created)).await;
        if view["state"] != "creating" {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    assert_eq!(view["state"], "ready", "{view}");
    assert_eq!(view["version"], "18");
    let uri = f.ok("101", "databases.credentials", id(&created)).await["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    let client = connect(&uri).await.unwrap();
    let version: String = client
        .query_one("SHOW server_version", &[])
        .await
        .unwrap()
        .get(0);
    assert!(version.starts_with("18"), "{version}");
    drop(client);
    f.ok("101", "databases.rotate", id(&created)).await;
    assert!(connect(&uri).await.is_err());
    assert_eq!(
        f.call("101", "databases.delete", id(&created))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    f.ok("101", "instances.delete", id(&created)).await;
    assert!(connect(&uri).await.is_err());
    f.cleanup().await;
}
