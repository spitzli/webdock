use serde_json::json;
use webdock_build::contracts::BuildCommand;
#[test]
fn retained_command_names_ids_selectors_and_null_semantics() {
    assert!(BuildCommand::parse(json!({"action":"git.builds.request","projectID":"123","targetID":"456","idempotencyKey":"build-request-1234"})).is_ok());
    for id in ["0", "+1", "01", "-1", "9223372036854775808"] {
        assert!(BuildCommand::parse(json!({"action":"git.sources.list","projectID":id})).is_err());
    }
    assert!(BuildCommand::parse(json!({"action":"git.builds.request","projectID":"123","sourceID":"456","idempotencyKey":"build-request-1234"})).is_err());
    assert!(BuildCommand::parse(json!({"action":"git.builds.request","projectID":"123","targetID":null,"idempotencyKey":"build-request-1234"})).is_err());
    assert!(
        BuildCommand::parse(json!({"action":"git.builds.list","projectID":"123","page":0}))
            .is_err()
    );
    assert!(
        BuildCommand::parse(json!({"action":"git.builds.list","projectID":"123","limit":101}))
            .is_err()
    );
}
#[test]
fn customer_environment_never_changes_host_or_guest_control_configuration() {
    use std::collections::BTreeMap;
    use webdock_build::execution::{GuestRequest, Limits};
    let mut request = GuestRequest {
        recipe: "dockerfile".into(),
        root_directory: ".".into(),
        build_environment: BTreeMap::new(),
        limits: Limits {
            cpu: 2,
            memory_mi_b: 4096,
            disk_bytes: 10 * 1024 * 1024 * 1024,
            duration_seconds: 1500,
        },
    };
    for key in [
        "PATH",
        "LD_PRELOAD",
        "GIT_CONFIG_GLOBAL",
        "WEBDOCK_TOKEN",
        "AWS_SECRET_ACCESS_KEY",
    ] {
        request.build_environment = BTreeMap::from([(key.into(), "secret".into())]);
        assert!(request.validate().is_err());
    }
    request.build_environment = BTreeMap::from([("PUBLIC_API".into(), "safe-value".into())]);
    assert!(request.validate().is_ok());
    assert_eq!(request.redact("x=safe-value"), "x=[REDACTED]");
}
#[test]
fn readonly_ceiling_is_an_explicit_allowlist() {
    let ceiling = webdock_build::BuildCeiling {
        read: true,
        write: false,
    };
    for action in [
        "git.connections.list",
        "git.repositories.list",
        "git.sources.list",
        "git.source.get",
        "git.builds.list",
        "git.builds.get",
        "git.releases.list",
    ] {
        assert!(ceiling.require(action).is_ok());
    }
    for action in [
        "git.connections.disconnect",
        "git.source.configure",
        "git.builds.request",
        "git.builds.cancel",
        "git.releases.approve",
        "git.releases.rollback",
        "git.future.get",
        "",
    ] {
        assert_eq!(
            ceiling.require(action).unwrap_err().code,
            "permission_denied"
        );
    }
    assert!(
        webdock_build::BuildCeiling {
            read: false,
            write: true
        }
        .require("git.sources.list")
        .is_err()
    );
}
