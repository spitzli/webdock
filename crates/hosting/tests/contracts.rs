use serde_json::json;
use webdock_hosting::contracts::{app_demand, parse_command, resolve_spec};
fn spec() -> serde_json::Value {
    json!({"template":"custom","image":format!("registry.invalid/app@sha256:{}","a".repeat(64)),"args":[],"port":8080,"healthPath":"/health","cpuMillicores":100,"memoryBytes":16777216,"ephemeralBytes":1048576,"replicas":1,"volumeBytes":0})
}
#[test]
fn strict_commands_do_not_accept_authority_or_mutation_fields() {
    assert!(parse_command(json!({"action":"apps.list","projectID":"1"})).is_ok());
    for input in [
        json!({"action":"apps.get","appID":1}),
        json!({"action":"apps.get","appID":"1","operator":true}),
        json!({"action":"apps.create","projectID":"1","name":"x","spec":spec(),"subscriptionRevision":0,"idempotencyKey":"short"}),
    ] {
        assert!(parse_command(input).is_err());
    }
}
#[test]
fn storage_is_retained_when_deleted_and_not_multiplied_by_replicas() {
    let mut value = spec();
    value["volumeBytes"] = json!(67108864);
    let demand = app_demand(&value, true).unwrap();
    assert_eq!(demand["apps"], 0);
    assert_eq!(demand["cpuMillicores"], 0);
    assert_eq!(demand["volumeBytes"], 67108864);
    value["replicas"] = json!(2);
    assert!(resolve_spec(value).is_err());
}
#[test]
fn healthcheck_uses_pinned_maintained_defaults() {
    let mut value = spec();
    value["template"] = json!("healthcheck");
    let resolved = resolve_spec(value).unwrap();
    assert_eq!(resolved["healthPath"], "/ping");
    assert!(
        resolved["image"]
            .as_str()
            .unwrap()
            .starts_with("docker.io/rancher/")
    );
}
