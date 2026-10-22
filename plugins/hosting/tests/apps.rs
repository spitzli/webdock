//! Real plugin storage on a disposable local PostgreSQL (`WEBDOCK_HOSTING_PLUGIN_TEST_ADMIN_URL`,
//! loopback) and real containers through the local Docker socket (`WEBDOCK_HOSTING_PLUGIN_TEST_DOCKER=1`).
use serde_json::{Value, json};
use std::time::Duration;
use tokio_postgres::NoTls;
use webdock_hosting::{Handler, Plugin, Settings, placement, seal::Sealer, store::Store};
use webdock_plugin_protocol::{ErrorCode, InvocationClaims, Manifest, PluginError};
use webdock_plugin_runtime::ActionHandler;

/// Present on the developer machine already, so the test needs no registry access.
const IMAGE: &str = "nginx:stable-alpine";

fn admin_url() -> url::Url {
    let url = url::Url::parse(
        &std::env::var("WEBDOCK_HOSTING_PLUGIN_TEST_ADMIN_URL").expect("disposable local server"),
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
async fn fixture() -> Fixture {
    assert_eq!(
        std::env::var("WEBDOCK_HOSTING_PLUGIN_TEST_DOCKER").as_deref(),
        Ok("1")
    );
    let storage = format!("hosting_test_{}", uuid::Uuid::new_v4().simple());
    admin()
        .await
        .batch_execute(&format!("CREATE DATABASE {storage}"))
        .await
        .unwrap();
    let mut url = admin_url();
    url.set_path(&storage);
    let placement = placement::Placement::new(&placement::PlacementConfig {
        docker_socket: "/var/run/docker.sock".into(),
        bind_host: "127.0.0.1".into(),
    })
    .unwrap();
    let plugin = Plugin::new(
        Store::connect(url.as_str()).await.unwrap(),
        Sealer::new(&"35".repeat(32)).unwrap(),
        placement,
        Settings {
            require_digest: false,
        },
    );
    Fixture {
        handler: Handler(plugin),
        storage,
    }
}
impl Fixture {
    async fn call(&self, project: &str, action: &str, input: Value) -> Result<Value, PluginError> {
        let claims = InvocationClaims {
            v: 1,
            id: uuid::Uuid::new_v4().to_string(),
            plugin_id: "hosting".into(),
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
    async fn code(&self, project: &str, action: &str, input: Value) -> ErrorCode {
        self.call(project, action, input).await.unwrap_err().code
    }
    /// Polls until the app leaves `deploying`.
    async fn settled(&self, app: &str) -> Value {
        for _ in 0..240 {
            let view = self
                .ok("101", "apps.view", json!({"resource_id": app}))
                .await;
            if view["status"] != "deploying" {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        panic!("deployment did not settle");
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
async fn http(url: &str) -> Option<String> {
    let address = url.strip_prefix("http://")?;
    for _ in 0..40 {
        if let Ok(mut socket) = tokio::net::TcpStream::connect(address).await {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            socket
                .write_all(b"GET / HTTP/1.0\r\nHost: app\r\n\r\n")
                .await
                .ok()?;
            let mut body = String::new();
            if socket.read_to_string(&mut body).await.is_ok() && body.starts_with("HTTP/1.") {
                return Some(body);
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    None
}

#[test]
fn shipped_manifest_is_the_reviewed_contract() {
    webdock_hosting::validate_manifest(
        &Manifest::parse(include_bytes!("../manifest.json")).unwrap(),
    )
    .unwrap();
}

#[test]
fn image_references_and_environment_are_bounded() {
    for good in [
        "nginx:stable-alpine",
        "ghcr.io/org/app:1.2.3",
        "registry.example.com:5000/a/b@sha256:".to_owned().as_str(),
    ] {
        let good = if good.ends_with("sha256:") {
            format!("{good}{}", "a".repeat(64))
        } else {
            good.to_owned()
        };
        assert!(
            webdock_hosting::image_reference(&good, false).is_ok(),
            "{good}"
        );
    }
    for bad in [
        "",
        "Nginx",
        "nginx latest",
        "-x",
        "a//b",
        "nginx@sha256:short",
        "nginx;rm",
    ] {
        assert!(
            webdock_hosting::image_reference(bad, false).is_err(),
            "{bad:?}"
        );
    }
    assert!(
        webdock_hosting::image_reference("nginx:stable-alpine", true).is_err(),
        "production requires a digest"
    );
    let env =
        webdock_hosting::environment("# comment\nA=1\n\nDATABASE_URL=postgres://x=y\n").unwrap();
    assert_eq!(
        env,
        vec![
            ("A".into(), "1".into()),
            ("DATABASE_URL".into(), "postgres://x=y".into())
        ]
    );
    for bad in ["NOVALUE", "1A=x", "A-B=x", "A=1\nA=2", "A=\u{1b}x"] {
        assert!(webdock_hosting::environment(bad).is_err(), "{bad:?}");
    }
}

#[tokio::test]
#[ignore = "requires a disposable local PostgreSQL server and Docker"]
async fn app_lifecycle() {
    let f = fixture().await;
    for (input, why) in [
        (
            json!({"name":"x","image":"Bad Image","port":80,"memory_mb":128}),
            "image",
        ),
        (
            json!({"name":"x","image":IMAGE,"port":0,"memory_mb":128}),
            "port",
        ),
        (
            json!({"name":"x","image":IMAGE,"port":80,"memory_mb":100}),
            "memory",
        ),
    ] {
        assert_eq!(
            f.code("101", "apps.create", input).await,
            ErrorCode::InvalidInput,
            "{why}"
        );
    }
    let app = f
        .ok(
            "101",
            "apps.create",
            json!({"name":"Website","image":IMAGE,"port":80,"memory_mb":128}),
        )
        .await["resource"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let view = f.settled(&app).await;
    assert_eq!(view["status"], "running", "{view}");
    let url = view["url"].as_str().unwrap().to_owned();
    assert!(
        http(&url).await.unwrap().contains("nginx"),
        "the app answers on its published port"
    );
    assert_eq!(
        f.code("202", "apps.view", json!({"resource_id": app}))
            .await,
        ErrorCode::NotFound,
        "another project cannot see it"
    );

    // Environment changes redeploy; values never come back, only the names.
    f.ok(
        "101",
        "apps.env",
        json!({"resource_id": app, "env": "GREETING=hello\nAPI_TOKEN=s3cret"}),
    )
    .await;
    let view = f.settled(&app).await;
    assert_eq!(view["env"], json!(["GREETING", "API_TOKEN"]));
    assert!(!view.to_string().contains("s3cret"));

    // Power controls and logs.
    f.ok(
        "101",
        "apps.power",
        json!({"resource_id": app, "action": "stop"}),
    )
    .await;
    assert_eq!(
        f.ok("101", "apps.view", json!({"resource_id": app})).await["status"],
        "stopped"
    );
    f.ok(
        "101",
        "apps.power",
        json!({"resource_id": app, "action": "start"}),
    )
    .await;
    assert_eq!(
        f.ok("101", "apps.view", json!({"resource_id": app})).await["status"],
        "running"
    );
    let url = f.ok("101", "apps.view", json!({"resource_id": app})).await["url"]
        .as_str()
        .unwrap()
        .to_owned();
    http(&url).await.unwrap();
    let logs = f.ok("101", "apps.logs", json!({"resource_id": app})).await;
    assert!(
        logs["lines"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l.as_str().unwrap().contains("GET /")),
        "{logs}"
    );

    // A broken image fails visibly; resize and a good image recover it.
    f.ok(
        "101",
        "apps.deploy",
        json!({"resource_id": app, "image": "registry.invalid/none/app:1", "port": 80}),
    )
    .await;
    let failed = f.settled(&app).await;
    assert_eq!(failed["status"], "failed");
    assert!(failed["error"].as_str().unwrap().contains("image"));
    f.ok(
        "101",
        "apps.deploy",
        json!({"resource_id": app, "image": IMAGE, "port": 80}),
    )
    .await;
    f.settled(&app).await;
    f.ok(
        "101",
        "apps.resize",
        json!({"resource_id": app, "memory_mb": 256}),
    )
    .await;
    let view = f.settled(&app).await;
    assert_eq!(
        (view["status"].as_str(), view["memoryMb"].as_i64()),
        (Some("running"), Some(256))
    );

    f.ok("101", "apps.delete", json!({"resource_id": app}))
        .await;
    assert_eq!(
        f.code("101", "apps.view", json!({"resource_id": app}))
            .await,
        ErrorCode::NotFound
    );
    assert!(http(&url).await.is_none(), "the container is gone");
    f.cleanup().await;
}
