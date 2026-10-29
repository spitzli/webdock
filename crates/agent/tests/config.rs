use serde_json::json;
use std::{os::unix::fs::PermissionsExt, path::Path};
use webdock_agent::config::{AgentConfig, IdentityState};
fn private() -> tempfile::TempDir {
    tempfile::Builder::new()
        .permissions(std::fs::Permissions::from_mode(0o700))
        .tempdir()
        .unwrap()
}
fn write(path: &Path, value: &serde_json::Value) {
    std::fs::write(path, serde_json::to_vec(value).unwrap()).unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
}
#[test]
fn private_config_and_generation_sequence_survive_restart_without_rollback() {
    let dir = private();
    let path = dir.path().join("agent.json");
    write(
        &path,
        &json!({"version":1,"installation":"test-install","agentId":"test-agent","generation":2,"stateDirectory":dir.path(),"control":{"kind":"unix","path":dir.path().join("core.sock")},"runtime":{"kind":"docker","socket":"/var/run/docker.sock","initializerImage":null}}),
    );
    let config = AgentConfig::load(&path).unwrap();
    {
        let mut state = IdentityState::open(&config, "unix").unwrap();
        assert_eq!(state.next_sequence().unwrap(), 1);
    }
    let mut state = IdentityState::open(&config, "unix").unwrap();
    assert_eq!(state.next_sequence().unwrap(), 2);
    let mut older = config.clone();
    older.generation = 1;
    assert!(IdentityState::open(&older, "unix").is_err());
    state.revoke().unwrap();
    assert!(IdentityState::open(&config, "unix").is_err());
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(AgentConfig::load(&path).is_err());
}
#[test]
fn config_rejects_symlinks_unknown_fields_and_network_plaintext() {
    let dir = private();
    let path = dir.path().join("config.json");
    std::os::unix::fs::symlink("/etc/passwd", &path).unwrap();
    assert!(AgentConfig::load(&path).is_err());
    std::fs::remove_file(&path).unwrap();
    let mut value = json!({"version":1,"installation":"test-install","agentId":"test-agent","generation":1,"stateDirectory":dir.path(),"control":{"kind":"mtls","origin":"http://localhost:1234","domain":"localhost","ca":dir.path().join("ca.pem"),"certificate":dir.path().join("cert.pem"),"key":dir.path().join("key.pem")},"runtime":{"kind":"docker","socket":"/var/run/docker.sock","initializerImage":null}});
    write(&path, &value);
    assert!(AgentConfig::load(&path).is_err());
    value["privileged"] = json!(true);
    write(&path, &value);
    assert!(AgentConfig::load(&path).is_err());
}

#[cfg(not(any(feature = "docker", feature = "kubernetes")))]
#[tokio::test]
async fn daemon_without_runtime_adapters_fails_closed_after_configuration_validation() {
    let dir = private();
    let path = dir.path().join("agent.json");
    write(
        &path,
        &json!({"version":1,"installation":"test-install","agentId":"test-agent","generation":1,"stateDirectory":dir.path(),"control":{"kind":"unix","path":dir.path().join("core.sock")},"runtime":{"kind":"docker","socket":"/var/run/docker.sock","initializerImage":null}}),
    );
    let config = AgentConfig::load(&path).unwrap();
    assert!(matches!(
        webdock_agent::management::Daemon::open(config).await,
        Err(webdock_agent::management::AgentError::Configuration(
            "Runtime adapter is not included in this build"
        ))
    ));
    assert!(!dir.path().join("commands.json").exists());
}

#[test]
fn plugin_runtime_domain_is_opt_in_and_requires_kubernetes() {
    let dir = private();
    let value = json!({"version":1,"installation":"test-install","agentId":"test-agent","generation":1,"stateDirectory":dir.path(),"control":{"kind":"unix","path":dir.path().join("core.sock")},"runtime":{"kind":"docker","socket":"/unused","initializerImage":null}});
    let old: AgentConfig = serde_json::from_value(value.clone()).unwrap();
    assert!(!old.plugin_runtime_enabled);
    old.validate().unwrap();
    let mut enabled = value;
    enabled["pluginRuntimeEnabled"] = true.into();
    assert!(
        serde_json::from_value::<AgentConfig>(enabled)
            .unwrap()
            .validate()
            .is_err()
    );
}
