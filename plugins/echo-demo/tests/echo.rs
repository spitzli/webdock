use serde_json::json;
use webdock_echo_demo::{Echo, validate_manifest};
use webdock_plugin_protocol::{InvocationClaims, Manifest};
use webdock_plugin_runtime::ActionHandler;

fn claims(action: &str) -> InvocationClaims {
    serde_json::from_value(json!({
        "v":1,"id":"00000000-0000-4000-8000-000000000001","pluginID":"echo-demo","generation":1,
        "action":action,"projectID":"201","iat":0,"exp":60
    }))
    .unwrap()
}
#[tokio::test]
async fn echoes_within_the_signed_project_and_rejects_everything_else() {
    let reply = Echo
        .invoke(
            &claims("demo.echo"),
            "t",
            json!({"message":"hi"}),
            json!({}),
        )
        .await
        .unwrap();
    assert_eq!(reply, json!({"message":"hi","projectID":"201"}));
    let panel = Echo
        .invoke(&claims("demo.panel"), "t", json!({}), json!({}))
        .await
        .unwrap();
    assert_eq!(panel["blocks"][0]["rows"], json!([]));
    for (action, input, configuration) in [
        ("demo.echo", json!({"message":"x".repeat(201)}), json!({})),
        ("demo.echo", json!({"message":"a\nb"}), json!({})),
        ("demo.echo", json!({"other":true}), json!({})),
        ("demo.echo", json!({}), json!({"x":1})),
        ("demo.unknown", json!({}), json!({})),
    ] {
        assert!(
            Echo.invoke(&claims(action), "t", input, configuration)
                .await
                .is_err()
        );
    }
}
#[test]
fn only_the_reviewed_demo_manifest_is_accepted() {
    let raw = include_str!("../manifest.json");
    validate_manifest(&Manifest::parse(raw.as_bytes()).unwrap()).unwrap();
    let mut changed: serde_json::Value = serde_json::from_str(raw).unwrap();
    changed["capabilities"] = json!(["plugin.http.read"]);
    let changed = serde_json::to_vec(&changed).unwrap();
    assert!(Manifest::parse(&changed).map_or(true, |m| validate_manifest(&m).is_err()));
}
