use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{Value, json};
use webdock_plugin_protocol::{Manifest, verify_invocation};

fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/project-notes.json")).unwrap()
}

#[test]
fn manifest_preserves_existing_wire_fields_and_rejects_privileged_extensions() {
    let value = fixture();
    let parsed = Manifest::parse(&serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(parsed.as_json(), &value);
    for key in ["command", "namespace", "rbac", "mounts", "sql", "hostURL"] {
        let mut value = fixture();
        value[key] = json!("forbidden");
        assert!(
            Manifest::parse(&serde_json::to_vec(&value).unwrap()).is_err(),
            "{key}"
        );
    }
}

#[test]
fn manifest_rejects_unsafe_schemas_images_capabilities_and_lifecycle() {
    for (pointer, value) in [
        ("/image", json!("registry.example.com/notes:latest")),
        ("/name", json!("core")),
        ("/protocolVersion", json!(2)),
        (
            "/configuration",
            json!({"type":"object","properties":{"x":{"$ref":"https://evil"}}}),
        ),
        ("/configuration", json!({"type":"array"})),
        ("/configuration", json!({"type":"string","default":7})),
        (
            "/configuration",
            json!({"type":"object","required":["missing"]}),
        ),
        ("/actions/0/capabilities", json!(["plugin.data.write"])),
        ("/jobs/0/intervalSeconds", json!(59)),
        (
            "/dependencies",
            json!([{"id":"project-notes","version":"1.0.0"}]),
        ),
        ("/readableSchema", json!({"min":2,"max":1})),
        (
            "/navigation",
            json!([{"id":"x","label":"X","path":"/ui/../secrets"}]),
        ),
        (
            "/migrations",
            json!([{"version":1,"checksum":"a".repeat(64),"steps":[{"op":"sql","sql":"DROP TABLE users"}]}]),
        ),
    ] {
        let mut manifest = fixture();
        *manifest.pointer_mut(pointer).unwrap() = value;
        assert!(
            Manifest::parse(&serde_json::to_vec(&manifest).unwrap()).is_err(),
            "{pointer}"
        );
    }
    assert!(Manifest::parse(br#"{"name":"a","name":"b"}"#).is_err());
    assert!(Manifest::parse(&vec![b' '; 262145]).is_err());
}

#[test]
fn declaration_is_distinct_from_installer_support() {
    let parsed = Manifest::parse(&serde_json::to_vec(&fixture()).unwrap()).unwrap();
    assert!(parsed.require_action_only_lifecycle().is_err());
    let mut manifest = fixture();
    manifest["jobs"] = json!([]);
    assert!(
        Manifest::parse(&serde_json::to_vec(&manifest).unwrap())
            .unwrap()
            .require_action_only_lifecycle()
            .is_ok()
    );
}

fn signed(value: &Value) -> String {
    let key = SigningKey::from_bytes(&[7; 32]);
    let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(value).unwrap());
    format!(
        "{body}.{}",
        URL_SAFE_NO_PAD.encode(key.sign(body.as_bytes()).to_bytes())
    )
}
fn claims() -> Value {
    json!({"v":1,"id":"123e4567-e89b-42d3-a456-426614174000","pluginID":"project-notes","generation":1,"action":"notes.read","projectID":"123","iat":1000,"exp":1060})
}

#[test]
fn signatures_bind_runtime_identity_and_expiration() {
    let key = SigningKey::from_bytes(&[7; 32]).verifying_key();
    let token = signed(&claims());
    let result = verify_invocation(&token, &key, "project-notes", 1, 1001).unwrap();
    assert_eq!(result.project_id, "123");
    for (field, value) in [
        ("pluginID", json!("other")),
        ("generation", json!(2)),
        ("exp", json!(1061)),
        ("exp", json!(1000)),
        ("iat", json!(1002)),
        ("extra", json!(true)),
    ] {
        let mut value_claims = claims();
        value_claims[field] = value;
        assert!(
            verify_invocation(&signed(&value_claims), &key, "project-notes", 1, 1001).is_err(),
            "{field}"
        );
    }
    assert!(verify_invocation(&(token + "x"), &key, "project-notes", 1, 1001).is_err());
}

#[test]
fn verifies_node_crypto_golden_signature_over_encoded_body() {
    let key = SigningKey::from_bytes(&[7; 32]).verifying_key();
    let token = include_str!("fixtures/node-invocation.txt").trim();
    assert_eq!(
        verify_invocation(token, &key, "project-notes", 1, 1001)
            .unwrap()
            .action,
        "notes.read"
    );
}

#[test]
fn availability_requires_all_live_authority_dimensions() {
    use webdock_plugin_protocol::{ActionPolicy, Availability};
    let manifest = Manifest::parse(&serde_json::to_vec(&fixture()).unwrap()).unwrap();
    let caps = vec!["plugin.data.read".into(), "plugin.data.write".into()];
    let valid = ActionPolicy {
        state: Availability::Enabled,
        ready: true,
        generation: 1,
        runtime_generation: 1,
        configuration_revision: 3,
        runtime_configuration_revision: 3,
        revoked: false,
        project_active: true,
        project_allowed: true,
        project_can_write: true,
        preview: false,
        approved: &caps,
        granted: &caps,
    };
    assert!(valid.authorize(&manifest, "notes.write").is_ok());
    for denied in [
        ActionPolicy {
            state: Availability::Draining,
            ..valid.clone()
        },
        ActionPolicy {
            state: Availability::Disabled,
            ..valid.clone()
        },
        ActionPolicy {
            ready: false,
            ..valid.clone()
        },
        ActionPolicy {
            runtime_generation: 2,
            ..valid.clone()
        },
        ActionPolicy {
            runtime_configuration_revision: 2,
            ..valid.clone()
        },
        ActionPolicy {
            revoked: true,
            ..valid.clone()
        },
        ActionPolicy {
            project_active: false,
            ..valid.clone()
        },
        ActionPolicy {
            project_allowed: false,
            ..valid.clone()
        },
        ActionPolicy {
            project_can_write: false,
            ..valid.clone()
        },
        ActionPolicy {
            preview: true,
            ..valid.clone()
        },
        ActionPolicy {
            granted: &[],
            ..valid.clone()
        },
        ActionPolicy {
            approved: &[],
            ..valid.clone()
        },
    ] {
        assert!(denied.authorize(&manifest, "notes.write").is_err());
    }
    assert!(valid.authorize(&manifest, "not-declared").is_err());
}

#[test]
fn values_enforce_nested_schemas_without_external_references() {
    use webdock_plugin_protocol::validate_value;
    let schema = json!({"type":"object","additionalProperties":false,"required":["items"],"properties":{"items":{"type":"array","maxItems":2,"items":{"type":"integer","minimum":1}}}});
    assert!(validate_value(Some(&schema), &json!({"items":[1,2]})).is_ok());
    for input in [
        json!({"items":[0]}),
        json!({"items":[1,2,3]}),
        json!({"items":[1],"secret":"x"}),
        json!({}),
    ] {
        assert!(validate_value(Some(&schema), &input).is_err());
    }
    assert!(
        validate_value(
            Some(&json!({"$ref":"https://example.invalid/schema"})),
            &json!({})
        )
        .is_err()
    );
}

#[test]
fn descriptor_preserves_exact_release_bytes_for_signature_checks() {
    let bytes = include_bytes!("fixtures/project-notes.json");
    let manifest = Manifest::parse(bytes).unwrap();
    assert_eq!(manifest.as_bytes(), bytes);
}

#[test]
fn required_services_fail_explicitly_but_optional_services_do_not_block() {
    let manifest = Manifest::parse(include_bytes!("fixtures/project-notes.json")).unwrap();
    assert!(manifest.require_host_services(&[]).is_err());
    assert!(manifest.require_host_services(&[("data", 1)]).is_ok());
    assert!(manifest.require_host_services(&[("data", 2)]).is_err());
}

#[test]
fn integer_valued_json_numbers_follow_javascript_manifest_semantics() {
    let bytes = include_str!("fixtures/project-notes.json")
        .replace("\"protocolVersion\": 1", "\"protocolVersion\": 1.0");
    assert!(Manifest::parse(bytes.as_bytes()).is_ok());
}

#[test]
fn schemas_and_migrations_reject_invalid_keys_defaults_and_foreign_references() {
    let table = json!({"name":"notes","columns":[{"name":"id","type":"string","nullable":false}],"primaryKey":["id"],"indexes":[],"foreignKeys":[]});
    let mut value = fixture();
    value["tables"] = json!([table.clone()]);
    value["migrations"] = json!([{"version":1,"checksum":"a".repeat(64),"steps":[{"op":"createTable","table":table}]}]);
    assert!(Manifest::parse(&serde_json::to_vec(&value).unwrap()).is_ok());
    for (pointer, invalid) in [
        ("/tables/0/primaryKey", json!(["missing"])),
        ("/tables/0/columns/0/nullable", json!(true)),
        (
            "/tables/0/foreignKeys",
            json!([{"name":"fk","columns":["id"],"references":{"table":"missing","columns":["id"]}}]),
        ),
        (
            "/tables/0/columns",
            json!([{"name":"id","type":"integer","nullable":false,"default":"bad"}]),
        ),
        ("/migrations/0/version", json!(2)),
    ] {
        let mut bad = value.clone();
        *bad.pointer_mut(pointer).unwrap() = invalid;
        assert!(
            Manifest::parse(&serde_json::to_vec(&bad).unwrap()).is_err(),
            "{pointer}"
        );
    }
}

#[test]
fn signed_integer_claims_accept_equivalent_json_number_syntax() {
    let key = SigningKey::from_bytes(&[7; 32]).verifying_key();
    let mut value = claims();
    value["generation"] = json!(1.0);
    value["iat"] = json!(1000.0);
    assert!(verify_invocation(&signed(&value), &key, "project-notes", 1, 1001).is_ok());
}
