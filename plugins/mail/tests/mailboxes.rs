//! A real Stalwart CE engine on the local dev k3s (`WEBDOCK_WORKLOAD_TEST_KUBECONFIG`, context
//! `webdock-dev`) behind its Traefik, and plugin storage on a disposable local PostgreSQL
//! (`WEBDOCK_MAIL_PLUGIN_TEST_ADMIN_URL`, loopback). A stand-in for Core and the cluster's agent
//! applies the engine's objects with kubectl in a namespace of the test's own.
use serde_json::{Value, json};
use std::{process::Command, sync::Mutex, time::Duration};
use tokio_postgres::NoTls;
use webdock_mail::{Dns, Handler, Plugin, Settings, engine, seal::Sealer, store::Store, transport};
use webdock_plugin_protocol::{ErrorCode, InvocationClaims, PluginError};
use webdock_plugin_runtime::ActionHandler;

const IMAGE: &str = "docker.io/stalwartlabs/stalwart@sha256:74e5a7d55303ba525d939c6bf97ed4e010df7521f52d80afc22a815b66bd53f3";

const ORIGIN: &str = "http://127.0.0.1:55480";
fn config() -> engine::EngineConfig {
    engine::EngineConfig {
        image: IMAGE.into(),
        domain: "mail.localhost".into(),
        imap_port: 55993,
        submission_port: 55465,
        admin: engine::AdminRoute {
            origin: ORIGIN.into(),
            domain: "mail-admin.localhost".into(),
            entry_points: vec!["web".into()],
        },
        issuer: Some("webdock-dev-ca".into()),
    }
}

/// Applies, prunes and removes like the agent, in one namespace, through kubectl.
struct Kube {
    namespace: String,
    applied: Mutex<Vec<(String, String)>>,
}
fn kubectl(args: &[&str], input: Option<&Value>) -> std::process::Output {
    let kubeconfig =
        std::env::var("WEBDOCK_WORKLOAD_TEST_KUBECONFIG").expect("local dev kubeconfig");
    let mut command = Command::new("kubectl");
    command
        .args(["--kubeconfig", &kubeconfig, "--context", "webdock-dev"])
        .args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = command.spawn().unwrap();
    if let Some(input) = input {
        use std::io::Write;
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.to_string().as_bytes())
            .unwrap();
    }
    drop(child.stdin.take());
    child.wait_with_output().unwrap()
}
fn resource(object: &Value) -> (String, String) {
    let api = object["apiVersion"].as_str().unwrap();
    let kind = object["kind"].as_str().unwrap().to_ascii_lowercase();
    let kind = match api.rsplit_once('/') {
        Some((group, _)) => format!("{kind}.{group}"),
        None => kind,
    };
    (
        kind,
        object["metadata"]["name"].as_str().unwrap().to_owned(),
    )
}
#[tonic::async_trait]
impl engine::Workloads for Kube {
    async fn call(&self, method: &str, input: Value) -> Result<Value, PluginError> {
        let ns = self.namespace.as_str();
        Ok(match method {
            "apply" => {
                let exists = kubectl(&["get", "namespace", ns], None).status.success();
                if !exists {
                    let created = kubectl(&["create", "namespace", ns], None);
                    assert!(created.status.success(), "{created:?}");
                    kubectl(
                        &[
                            "label",
                            "namespace",
                            ns,
                            "pod-security.kubernetes.io/enforce=baseline",
                        ],
                        None,
                    );
                }
                let mut objects = input["objects"].as_array().unwrap().clone();
                for object in &mut objects {
                    object["metadata"]["namespace"] = json!(ns);
                }
                let out = kubectl(
                    &[
                        "apply",
                        "--server-side",
                        "--force-conflicts",
                        "--field-manager",
                        "webdock-test",
                        "-f",
                        "-",
                    ],
                    Some(&json!({"apiVersion": "v1", "kind": "List", "items": objects})),
                );
                assert!(
                    out.status.success(),
                    "{}",
                    String::from_utf8_lossy(&out.stderr)
                );
                let wanted: Vec<_> = objects.iter().map(resource).collect();
                let mut applied = self.applied.lock().unwrap();
                for (kind, name) in applied.iter().filter(|r| !wanted.contains(r)) {
                    kubectl(
                        &["delete", "-n", ns, kind, name, "--ignore-not-found"],
                        None,
                    );
                }
                *applied = wanted;
                json!({})
            }
            "remove" => {
                kubectl(
                    &[
                        "delete",
                        "namespace",
                        ns,
                        "--ignore-not-found",
                        "--wait=true",
                    ],
                    None,
                );
                self.applied.lock().unwrap().clear();
                json!({})
            }
            _ if !kubectl(&["get", "namespace", ns], None).status.success() => {
                json!({"removed": true})
            }
            _ => json!({"observed": {}}),
        })
    }
}

fn admin_url() -> url::Url {
    let url = url::Url::parse(
        &std::env::var("WEBDOCK_MAIL_PLUGIN_TEST_ADMIN_URL").expect("disposable local server"),
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
        let claims = InvocationClaims {
            v: 1,
            id: uuid::Uuid::new_v4().to_string(),
            plugin_id: "mail".into(),
            generation: 1,
            action: action.into(),
            project_id: project.into(),
            iat: 0,
            exp: 0,
        };
        self.handler.invoke(&claims, "", input, json!({})).await
    }
    async fn ok(&self, action: &str, input: Value) -> Value {
        self.call(&self.project, action, input)
            .await
            .unwrap_or_else(|e| panic!("{action}: {e:?}"))
    }
    async fn code(&self, action: &str, input: Value) -> ErrorCode {
        self.call(&self.project, action, input)
            .await
            .unwrap_err()
            .code
    }
}
/// A JMAP session through the engine's route, as the mailbox's user.
async fn session(project: &str, user: &str, password: &str) -> u16 {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap()
        .get(format!("{ORIGIN}/jmap/session"))
        .header(
            reqwest::header::HOST,
            format!("p{project}.mail-admin.localhost"),
        )
        .basic_auth(user, Some(password))
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

#[test]
fn engines_have_no_egress_and_drop_the_setup_administrator() {
    struct Nowhere;
    #[tonic::async_trait]
    impl engine::Workloads for Nowhere {
        async fn call(&self, _: &str, _: Value) -> Result<Value, PluginError> {
            unreachable!()
        }
    }
    let engines = engine::Engines::new(Box::new(Nowhere), config()).unwrap();
    let kinds = |objects: &Value| -> Vec<String> {
        objects
            .as_array()
            .unwrap()
            .iter()
            .map(|o| format!("{}/{}", o["kind"], o["metadata"]["name"]))
            .collect()
    };
    let setup = engines.objects("7", Some("pw"), "a");
    assert!(kinds(&setup).contains(&r#""Secret"/"engine-recovery""#.to_owned()));
    let ready = engines.objects("7", None, "b");
    assert!(!kinds(&ready).iter().any(|k| k.contains("Secret")));
    let deployment = ready
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["kind"] == "Deployment")
        .unwrap();
    assert_eq!(
        deployment["spec"]["template"]["spec"]["containers"][0]["envFrom"],
        json!([])
    );
    let policy = ready
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["kind"] == "NetworkPolicy")
        .unwrap();
    assert_eq!(
        (
            policy["spec"]["policyTypes"].clone(),
            policy["spec"]["egress"].clone()
        ),
        (json!(["Egress"]), json!([]))
    );
    let imaps = ready
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["metadata"]["name"] == "engine-imaps")
        .unwrap();
    assert_eq!(
        imaps["spec"]["routes"][0]["match"],
        "HostSNI(`p7.mail.localhost`)"
    );
    assert!(
        engine::Engines::new(
            Box::new(Nowhere),
            engine::EngineConfig {
                image: "stalwart:latest".into(),
                ..config()
            }
        )
        .is_err()
    );
}

#[tokio::test]
#[ignore = "requires a disposable local PostgreSQL server and the local dev k3s"]
async fn mailbox_lifecycle() {
    let storage = format!("mailbox_test_{}", uuid::Uuid::new_v4().simple());
    admin()
        .await
        .batch_execute(&format!("CREATE DATABASE {storage}"))
        .await
        .unwrap();
    let mut url = admin_url();
    url.set_path(&storage);
    let project = format!("9{}", std::process::id());
    let namespace = format!("wd-mailtest-{project}");
    let kube = || Kube {
        namespace: namespace.clone(),
        applied: Mutex::new(Vec::new()),
    };
    let plugin = Plugin::new(
        Store::connect(url.as_str()).await.unwrap(),
        Sealer::new(&"57".repeat(32)).unwrap(),
        transport::Sender::new("http://127.0.0.1:9"),
        Box::new(NoDns),
        Settings {
            platform: transport::Platform::Smtp {
                host: "127.0.0.1".into(),
                port: 9,
            },
            trust_unverified_domains: true,
        },
        Some(engine::Engines::new(Box::new(kube()), config()).unwrap()),
    );
    let f = Fixture {
        handler: Handler(plugin),
        storage,
        project,
    };

    let domain = f
        .ok("domains.create", json!({"domain":"shop.example.test"}))
        .await["resource"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    for bad in ["", "Anna Smith", "a..b", "-a"] {
        assert_eq!(
            f.code(
                "mailboxes.create",
                json!({"domain_id": domain, "local_part": bad})
            )
            .await,
            ErrorCode::InvalidInput,
            "{bad:?}"
        );
    }
    assert_eq!(
        f.call(
            "202",
            "mailboxes.create",
            json!({"domain_id": domain, "local_part": "x"})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotFound,
        "another project's domain"
    );
    let created = f
        .ok(
            "mailboxes.create",
            json!({"domain_id": domain, "local_part": "Anna", "name": "Anna"}),
        )
        .await;
    assert_eq!(created["resource"]["name"], "anna@shop.example.test");
    let mailbox = created["resource"]["id"].as_str().unwrap().to_owned();
    assert_eq!(
        f.code(
            "mailboxes.create",
            json!({"domain_id": domain, "local_part": "anna"})
        )
        .await,
        ErrorCode::Conflict
    );

    let mut view = Value::Null;
    for _ in 0..600 {
        view = f
            .ok("mailboxes.view", json!({"resource_id": mailbox}))
            .await;
        if view["state"] != "creating" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    assert_eq!(view["state"], "ready", "{view}");
    assert_eq!(
        f.call("202", "mailboxes.view", json!({"resource_id": mailbox}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    let password = f
        .ok("mailboxes.credentials", json!({"resource_id": mailbox}))
        .await["value"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        session(&f.project, "anna@shop.example.test", &password).await,
        200
    );
    assert_eq!(
        session(&f.project, "anna@shop.example.test", "wrong").await,
        401
    );
    // Mail clients reach IMAPS by server name and can verify the issued certificate.
    let kubeconfig = std::env::var("WEBDOCK_WORKLOAD_TEST_KUBECONFIG").unwrap();
    let ca = std::path::Path::new(&kubeconfig)
        .parent()
        .unwrap()
        .join("../ca/ca.crt");
    let host = view["host"].as_str().unwrap();
    let handshake = Command::new("openssl")
        .args([
            "s_client",
            "-connect",
            "127.0.0.1:55993",
            "-servername",
            host,
            "-verify_hostname",
            host,
            "-verify_return_error",
            "-CAfile",
        ])
        .arg(&ca)
        .stdin(std::process::Stdio::null())
        .output()
        .unwrap();
    assert!(
        String::from_utf8_lossy(&handshake.stdout).contains("Verify return code: 0 (ok)"),
        "{}",
        String::from_utf8_lossy(&handshake.stderr)
    );

    // The domain shows its DKIM record once mailboxes use it, and cannot be removed under them.
    let domain_view = f.ok("domains.view", json!({"resource_id": domain})).await;
    assert!(
        domain_view["records"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["name"]
                .as_str()
                .unwrap()
                .contains("._domainkey.shop.example.test")),
        "{domain_view}"
    );
    assert_eq!(domain_view["mailboxes"], json!(["anna@shop.example.test"]));
    assert_eq!(
        f.code("domains.delete", json!({"resource_id": domain}))
            .await,
        ErrorCode::Conflict
    );

    f.ok("mailboxes.rotate", json!({"resource_id": mailbox}))
        .await;
    assert_eq!(
        session(&f.project, "anna@shop.example.test", &password).await,
        401
    );
    let rotated = f
        .ok("mailboxes.credentials", json!({"resource_id": mailbox}))
        .await["value"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        session(&f.project, "anna@shop.example.test", &rotated).await,
        200
    );

    f.ok("mailboxes.delete", json!({"resource_id": mailbox}))
        .await;
    assert_eq!(
        session(&f.project, "anna@shop.example.test", &rotated).await,
        401
    );
    f.ok("mailboxes.delete", json!({"resource_id": mailbox}))
        .await;
    f.ok("domains.delete", json!({"resource_id": domain})).await;

    engine::Engines::new(Box::new(kube()), config())
        .unwrap()
        .destroy(&f.project)
        .await
        .unwrap();
    drop(f.handler);
    admin()
        .await
        .batch_execute(&format!("DROP DATABASE {} WITH (FORCE)", f.storage))
        .await
        .unwrap();
}
