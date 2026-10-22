//! The workload executor against a real disposable cluster: the local dev k3s
//! (`WEBDOCK_WORKLOAD_TEST_KUBECONFIG`, context `webdock-dev`). Everything lives in one unique
//! namespace that the test removes.
#![cfg(feature = "kubernetes")]
use kube::{
    Client, Config,
    api::{Api, DeleteParams},
    config::{KubeConfigOptions, Kubeconfig},
    core::{ApiResource, DynamicObject, GroupVersionKind},
};
use serde_json::{Value, json};
use std::time::Duration;
use webdock_agent::workloads::WorkloadExecutor;

async fn client() -> Client {
    let path = std::env::var("WEBDOCK_WORKLOAD_TEST_KUBECONFIG").expect("local dev kubeconfig");
    let options = KubeConfigOptions {
        context: Some("webdock-dev".into()),
        ..Default::default()
    };
    let config = Config::from_custom_kubeconfig(Kubeconfig::read_from(path).unwrap(), &options)
        .await
        .unwrap();
    assert!(
        config.cluster_url.host().is_some_and(|h| h == "127.0.0.1"),
        "only the local cluster"
    );
    Client::try_from(config).unwrap()
}
fn labelled(mut object: Value, namespace: &str, unit: &str) -> Value {
    let labels = json!({"webdock.dev/managed-by":"webdock","webdock.dev/plugin":"fixture","webdock.dev/project-id":"1","webdock.dev/unit":unit,"app":unit});
    object["metadata"]["namespace"] = json!(namespace);
    object["metadata"]["labels"] = labels.clone();
    if object["kind"] == "Deployment" {
        object["spec"]["template"]["metadata"]["labels"] = labels;
    }
    object
}

#[tokio::test]
#[ignore = "requires the local dev k3s"]
async fn applies_prunes_observes_and_removes_a_unit() {
    let client = client().await;
    let executor = WorkloadExecutor::new(client.clone());
    let namespace = format!("wd-fixture-{}", std::process::id());
    let unit = "web";
    let deployment = labelled(
        json!({"apiVersion":"apps/v1","kind":"Deployment","metadata":{"name":"web"},
        "spec":{"replicas":1,"selector":{"matchLabels":{"app":"web"}},"template":{"metadata":{},
        "spec":{"automountServiceAccountToken":false,"containers":[{"name":"web","image":"nginx:stable-alpine","ports":[{"containerPort":80}]}]}}}}),
        &namespace,
        unit,
    );
    let service = labelled(
        json!({"apiVersion":"v1","kind":"Service","metadata":{"name":"web"},"spec":{"selector":{"app":"web"},"ports":[{"port":80}]}}),
        &namespace,
        unit,
    );
    let both = serde_json::to_vec(&json!([deployment, service])).unwrap();

    // Objects outside the unit are refused before anything is applied.
    let foreign =
        serde_json::to_vec(&json!([labelled(service.clone(), "kube-system", unit)])).unwrap();
    assert!(
        executor
            .handle("fixture", unit, &namespace, &foreign, false)
            .await
            .error
            .is_some()
    );

    let mut outcome = executor
        .handle("fixture", unit, &namespace, &both, false)
        .await;
    assert_eq!(outcome.error, None);
    for _ in 0..120 {
        if outcome.observed["ready"] == true {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
        outcome = executor
            .handle("fixture", unit, &namespace, &both, false)
            .await;
    }
    assert_eq!(outcome.observed["ready"], true, "{}", outcome.observed);
    // Recent pod output travels with the observation.
    let mut logged = outcome;
    for _ in 0..20 {
        if logged.observed["logs"]
            .as_array()
            .is_some_and(|l| !l.is_empty())
        {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
        logged = executor
            .handle("fixture", unit, &namespace, &both, false)
            .await;
    }
    assert!(
        logged.observed["logs"]
            .as_array()
            .is_some_and(|l| !l.is_empty()),
        "{}",
        logged.observed
    );

    // Dropping the service from the unit prunes it.
    let only = serde_json::to_vec(&json!([deployment])).unwrap();
    assert_eq!(
        executor
            .handle("fixture", unit, &namespace, &only, false)
            .await
            .error,
        None
    );
    let services: Api<DynamicObject> = Api::namespaced_with(
        client.clone(),
        &namespace,
        &ApiResource::from_gvk(&GroupVersionKind::gvk("", "v1", "Service")),
    );
    assert!(services.get_opt("web").await.unwrap().is_none());

    // Removal deletes everything of the unit and says so once nothing is left.
    let mut removal = executor
        .handle("fixture", unit, &namespace, b"[]", true)
        .await;
    for _ in 0..60 {
        if removal.removed {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
        removal = executor
            .handle("fixture", unit, &namespace, b"[]", true)
            .await;
    }
    assert!(removal.removed);
    let namespaces: Api<DynamicObject> = Api::all_with(
        client,
        &ApiResource::from_gvk(&GroupVersionKind::gvk("", "v1", "Namespace")),
    );
    namespaces
        .delete(&namespace, &DeleteParams::default())
        .await
        .unwrap();
}
