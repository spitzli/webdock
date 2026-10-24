//! Real generic native installer preparation; process transport is covered in provisioning_mail.
#[path = "support/mail_catalog.rs"]
mod mail_catalog;
#[allow(
    dead_code,
    reason = "Shared TLS metadata fixture retains its owned directory and admin helper"
)]
#[path = "support/provisioning_fixture.rs"]
mod metadata;
#[allow(
    dead_code,
    reason = "Shared owned HTTP fixture also supplies unrelated authority cases"
)]
#[path = "../../control-plane/tests/support/plugin_installation.rs"]
mod native;
#[allow(
    dead_code,
    reason = "Only private file writer is needed from existing process helpers"
)]
#[path = "support/runtime_fixture.rs"]
mod process;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use sea_orm::{ConnectionTrait, DbBackend, Statement};
use serde_json::{Value, json};
use tower::ServiceExt;
use webdock_control_plane::{
    plugin_config::{PluginConfig, RuntimeConnections},
    plugins::{PluginEndpoints, installation::worker::InstallationWorker},
};
use webdock_plugin_host::{Catalog, provisioning::tls::issue_runtime_identity};

#[test]
fn actual_signed_mail_catalog_binds_private_recipe_and_current_feature_ceiling() {
    let raw = mail_catalog::catalog(json!({}), mail_catalog::recipe(Value::Null));
    let catalog = Catalog::from_bytes(&serde_json::to_vec(&raw).unwrap()).unwrap();
    let public = serde_json::to_value(catalog.descriptors()).unwrap();
    assert_eq!(public[0]["pluginID"], "mail");
    assert_eq!(public[0]["schemaVersion"], 1);
    assert_eq!(public[0]["readableSchema"], json!({"min":1,"max":1}));
    assert_eq!(
        public[0]["supportedFeatures"],
        json!(["add-domains", "create-mailboxes", "manage-incoming"])
    );
    assert_eq!(public[0]["capabilities"], json!(["plugin.workloads"]));
    assert!(public[0].get("recipe").is_none());
    assert!(!public.to_string().contains("platformTransport"));
    for fault in ["recipe", "feature", "signature", "image"] {
        let mut changed = raw.clone();
        match fault {
            "recipe" => {
                changed["releases"][0]["recipe"]["privateConfiguration"]["trustUnverifiedDomains"] =
                    json!(true)
            }
            "feature" => changed["releases"][0]["supportedFeatures"] = json!(["create-mailboxes"]),
            "signature" => changed["releases"][0]["jws"] = json!("invalid.signature.input"),
            _ => {
                let text = changed["releases"][0]["manifestRaw"]
                    .as_str()
                    .unwrap()
                    .replace("fixture.invalid/mail", "changed.invalid/mail");
                changed["releases"][0]["manifestRaw"] = json!(text);
            }
        }
        let result = Catalog::from_bytes(&serde_json::to_vec(&changed).unwrap());
        if ["recipe", "feature"].contains(&fault) {
            assert_ne!(
                public[0]["targets"][0]["reviewSha256"],
                serde_json::to_value(result.unwrap().descriptors()).unwrap()[0]["targets"][0]["reviewSha256"]
            );
        } else {
            assert!(result.is_err());
        }
    }
}

fn open(parts: &Value, name: &str) -> String {
    let cipher = webdock_secrets::SecretCipher::new(native::SECRET).unwrap();
    parts
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
        .map(|(index, part)| {
            cipher
                .open::<String>(
                    part.as_str().unwrap(),
                    &format!("plugin-install:mail:1:{name}:{index}"),
                )
                .unwrap()
        })
        .collect()
}

#[tokio::test]
#[ignore = "owns separate disposable native platform and TLS metadata PostgreSQL containers"]
async fn generic_worker_generates_mail_tls_storage_sealing_and_workload_binding_without_product_branch()
 {
    assert_eq!(
        std::env::var("WEBDOCK_PLUGIN_PROVISIONING_DOCKER_TEST").as_deref(),
        Ok("1")
    );
    let pg = metadata::Fixture::start().await;
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path();
    let callback_listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let callback_origin = format!(
        "https://localhost:{}",
        callback_listener.local_addr().unwrap().port()
    );
    let kernel_key = rcgen::KeyPair::generate().unwrap();
    let mut kernel_params = rcgen::CertificateParams::new(Vec::<String>::new()).unwrap();
    kernel_params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    kernel_params.key_usages = vec![
        rcgen::KeyUsagePurpose::KeyCertSign,
        rcgen::KeyUsagePurpose::CrlSign,
    ];
    let kernel_ca_pem = kernel_params.self_signed(&kernel_key).unwrap().pem();
    let kernel_key_pem = kernel_key.serialize_pem();
    let core = issue_runtime_identity(&kernel_ca_pem, &kernel_key_pem, "localhost").unwrap();
    for (name, value) in [
        ("core.crt", core.certificate_pem.as_str()),
        ("core.key", core.private_key_pem.as_str()),
        ("ca.crt", kernel_ca_pem.as_str()),
        ("ca.key", kernel_key_pem.as_str()),
        ("metadata-ca.crt", pg.ca.as_str()),
        ("invocation.key", &"49".repeat(32)),
    ] {
        process::private(&path.join(name), value);
    }
    let policy = json!({"runtimeDomain":"plugins.example.test","runtimePort":8443,"entryPoint":"websecure","storageID":"mail-metadata","core":{"origin":callback_origin,"domain":"localhost","certificate":path.join("core.crt"),"privateKey":path.join("core.key"),"authority":path.join("ca.crt"),"serverCertificateSha256":core.certificate_sha256},"runtimeIdentity":{"authority":path.join("ca.crt"),"privateKey":path.join("ca.key")},"resources":{"cpuMillicores":100,"memoryBytes":268435456},"egress":[{"cidr":"127.0.0.1/32","port":5432}]});
    let raw = mail_catalog::catalog(policy, mail_catalog::recipe(Value::Null));
    let native = native::Fixture::new(raw).await;
    native.enroll().await;
    let descriptor = &Catalog::from_bytes(&serde_json::to_vec(&native.catalog).unwrap())
        .unwrap()
        .descriptors()[0];
    let input = json!({"catalogID":"mail","version":"0.1.0","reviewSha256":descriptor.targets[0].review_sha256,"targetID":"mail-eu","configuration":{},"approvedCapabilities":["plugin.workloads"],"idempotencyKey":"mail-generic-installer"});
    let response = native
        .local
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("host", "localhost:3120")
                .header("origin", native::ORIGIN)
                .header("cookie", &native.operator_cookie)
                .header("content-type", "application/json")
                .body(Body::from(input.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let receipt: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(receipt["pluginID"], "mail");
    let worker_path = path.join("worker.json");
    process::private(&worker_path,json!({"storageTargets":[{"id":"mail-metadata","adminUrl":pg.admin_url,"authority":path.join("metadata-ca.crt"),"runtimeHost":"localhost","runtimePort":pg.port}]}).to_string());
    let config_path = path.join("plugin.json");
    process::private(&config_path,json!({"hostBindings":path.join("empty.json"),"invocationSigningKey":path.join("invocation.key"),"connections":path.join("empty.json"),"control":{"kind":"mutualTls","address":"127.0.0.1:6140","certificate":path.join("core.crt"),"privateKey":path.join("core.key"),"authority":path.join("ca.crt")}}).to_string());
    process::private(&path.join("empty.json"), r#"{"runtimes":{}}"#);
    let plugin = PluginConfig::load(&config_path).unwrap();
    let worker = InstallationWorker::load(&worker_path, &native.owner, &plugin)
        .await
        .unwrap();
    let endpoints = PluginEndpoints::new(
        native.host.clone(),
        RuntimeConnections::new(path.join("empty.json")),
        None,
    );
    assert!(worker.advance(&endpoints).await.unwrap());
    let row=native.owner.query_one_raw(Statement::from_string(DbBackend::Postgres,"SELECT e.private_components,e.spec,e.binding,o.phase FROM webdock_auth.plugin_install_execution e JOIN webdock_auth.plugin_operation o ON o.id=e.operation_id WHERE e.plugin_id='mail'")).await.unwrap().unwrap();
    assert_eq!(row.try_get::<String>("", "phase").unwrap(), "deploying");
    let parts: Value = row.try_get("", "private_components").unwrap();
    let files = webdock_agent_protocol::plugin::MATERIAL_FILES
        .iter()
        .map(|file| {
            let text = if *file == "manifest.json" {
                native.catalog["releases"][0]["manifestRaw"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            } else {
                open(
                    &parts[format!("material.{file}")],
                    &format!("material.{file}"),
                )
            };
            ((*file).to_owned(), text)
        })
        .collect();
    let material = webdock_agent_protocol::plugin::PluginRuntimeMaterial { files };
    let spec: Value = row.try_get("", "spec").unwrap();
    assert!(
        material.fingerprint().unwrap() == spec["materialSha256"],
        "worker material identity differs; contents withheld"
    );
    let config: Value = serde_json::from_str(&material.files["runtime.json"]).unwrap();
    assert!(config.get("listen").is_none() && config.get("core").is_none());
    assert_eq!(
        config["platformTransport"],
        json!({"kind":"smtp","host":"127.0.0.1","port":9})
    );
    assert!(config["mailboxes"].is_null());
    assert_eq!(config["generation"], 1);
    assert_eq!(config["manifest"], "/run/webdock/runtime/manifest.json");
    assert_eq!(config["storageCa"], "/run/webdock/runtime/storage-ca.crt");
    assert_eq!(config["secretKeyHex"].as_str().unwrap().len(), 64);
    let transport: webdock_plugin_kit::transport::RuntimeTransport = serde_json::from_value(
        json!({"listenTls":config["listenTls"],"coreTls":config["coreTls"]}),
    )
    .unwrap();
    transport.validate().unwrap();
    let ca = open(&parts["material.storage-ca.crt"], "material.storage-ca.crt");
    let kernel_ca = open(&parts["material.core-ca.crt"], "material.core-ca.crt");
    assert!(
        ca != kernel_ca,
        "metadata and kernel trust must be independent; contents withheld"
    );
    assert!(
        ca == pg.ca && kernel_ca == kernel_ca_pem,
        "worker trust authorities differ from reviewed inputs; contents withheld"
    );
    assert!(
        webdock_plugin_kit::postgres::connect(
            config["storageUrl"].as_str().unwrap(),
            Some(kernel_ca.as_bytes())
        )
        .await
        .is_err(),
        "kernel authority must not authenticate metadata PostgreSQL"
    );
    let app = webdock_plugin_kit::postgres::connect(
        config["storageUrl"].as_str().unwrap(),
        Some(ca.as_bytes()),
    )
    .await
    .unwrap();
    assert!(
        app.query_one(
            "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
            &[]
        )
        .await
        .unwrap()
        .get::<_, bool>(0)
    );
    let privileged:bool=app.query_one("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls FROM pg_roles WHERE rolname=current_user",&[]).await.unwrap().get(0);
    assert!(!privileged);
    assert!(
        app.query_one("SELECT to_regclass('public.customer_engines')::text", &[])
            .await
            .unwrap()
            .get::<_, Option<String>>(0)
            .is_none(),
        "generic preparation must not initialize or provision customer engines"
    );
    let binding: Value = row.try_get("", "binding").unwrap();
    assert_eq!(binding["workloadCluster"], "42");
    assert_eq!(
        binding["routeDomains"],
        json!(["mail.example.test", "mail-admin.example.test"])
    );
    assert_eq!(binding["projects"], json!({}));
    let endpoint: Value =
        serde_json::from_str(&open(&parts["prepared.endpoint"], "prepared.endpoint")).unwrap();
    assert!(
        endpoint["transport"]["origin"]
            .as_str()
            .unwrap()
            .ends_with(":443")
    );
    assert_eq!(
        endpoint["transport"]["serverCertificateSha256"],
        binding["credentialSha256"]
    );
    assert_eq!(
        config["corePeers"][0]["certificateSha256"],
        core.certificate_sha256
    );
    assert_eq!(native::count(&native.owner,"SELECT count(*)::bigint n FROM webdock_auth.plugin_installation WHERE id='mail' AND current_generation IS NULL AND candidate_generation=1").await,1);
    assert_eq!(
        native::count(
            &native.owner,
            "SELECT count(*)::bigint n FROM webdock_auth.plugin_workload"
        )
        .await,
        0
    );
    // Relocate only mounted file paths/listen address; the real binary consumes the worker's
    // actual private configuration, generated metadata login and retained sealing material.
    let binary = std::env::var_os("WEBDOCK_MAIL_RUNTIME_BINARY")
        .expect("explicit owned Mail executable required");
    for (file, text) in &material.files {
        process::private(&path.join(file), text);
    }
    let mut relocated = config.clone();
    relocated["manifest"] = json!(path.join("manifest.json"));
    relocated["storageCa"] = json!(path.join("storage-ca.crt"));
    for section in ["listenTls", "coreTls"] {
        for (field, file) in [
            ("certificate", "runtime.crt"),
            ("privateKey", "runtime.key"),
            ("authority", "core-ca.crt"),
        ] {
            relocated[section][field] = json!(path.join(file));
        }
    }
    let free = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = free.local_addr().unwrap().port();
    drop(free);
    relocated["listenTls"]["address"] = json!(format!("127.0.0.1:{port}"));
    let runtime_config = path.join("mail-runtime.json");
    process::private(&runtime_config, relocated.to_string());
    let mut child = process::Child(
        std::process::Command::new(binary)
            .arg(runtime_config)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let mut ready = false;
    for _ in 0..100 {
        assert!(
            child.0.try_wait().unwrap().is_none(),
            "Mail rejected generic installer configuration; diagnostics withheld"
        );
        let tls = webdock_plugin_runtime::PinnedMutualTls {
            certificate: core.certificate_pem.as_bytes().to_vec(),
            private_key: core.private_key_pem.as_bytes().to_vec(),
            authority: kernel_ca.as_bytes().to_vec(),
            server_certificate_sha256: binding["credentialSha256"].as_str().unwrap().into(),
        };
        if let Ok(mut client) = webdock_plugin_runtime::connect_pinned_mtls(
            format!("https://127.0.0.1:{port}"),
            spec["runtimeHost"].as_str().unwrap().into(),
            tls,
        )
        .await
            && client
                .health(webdock_plugin_runtime::wire::HealthRequest {})
                .await
                .is_ok()
        {
            ready = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(ready, "generic Mail configuration listener deadline");
    let wrong_authority = webdock_plugin_runtime::PinnedMutualTls {
        certificate: core.certificate_pem.as_bytes().to_vec(),
        private_key: core.private_key_pem.as_bytes().to_vec(),
        authority: ca.as_bytes().to_vec(),
        server_certificate_sha256: binding["credentialSha256"].as_str().unwrap().into(),
    };
    assert!(
        webdock_plugin_runtime::connect_pinned_mtls(
            format!("https://127.0.0.1:{port}"),
            spec["runtimeHost"].as_str().unwrap().into(),
            wrong_authority
        )
        .await
        .is_err(),
        "metadata authority must not authenticate Mail runtime"
    );
    assert_eq!(
        app.query_one("SELECT count(*) FROM customer_engines", &[])
            .await
            .unwrap()
            .get::<_, i64>(0),
        0
    );
    let versions: Vec<i32> = app
        .query(
            "SELECT version FROM schema_migrations ORDER BY version",
            &[],
        )
        .await
        .unwrap()
        .iter()
        .map(|r| r.get(0))
        .collect();
    assert_eq!(versions, [1, 2, 3]);
    assert!(
        std::process::Command::new("kill")
            .args(["-INT", &child.0.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while child.0.try_wait().unwrap().is_none() {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("Mail shutdown while callback pending");
    assert!(child.0.try_wait().unwrap().unwrap().success());
}
