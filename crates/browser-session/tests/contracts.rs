use webdock_browser_session::{BrowserConfig, safe_return_to};

#[test]
fn local_session_authority_preserves_wire_shape_and_rejects_browser_fields() {
    use webdock_browser_session::StoredAuthority;
    let wire = serde_json::json!({"kind": "local-session"});
    let authority: StoredAuthority = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(serde_json::to_value(authority).unwrap(), wire);
    assert!(
        serde_json::from_value::<StoredAuthority>(
            serde_json::json!({"kind": "local-session", "browser": {}})
        )
        .is_err()
    );
}

#[test]
fn redirect_boundaries_allow_existing_console_paths_and_reject_auth_loops() {
    for path in [
        "/projects",
        "/tenants/123",
        "/account",
        "/sites",
        "/admin/collections/pages?limit=10",
    ] {
        assert_eq!(safe_return_to(path).as_deref(), Some(path));
    }
    for path in [
        "//evil.invalid",
        "https://evil.invalid",
        "/projects/%2f%2fevil.invalid",
        "/projects/%252f",
        "/login",
        "/api/sso/callback",
        "/admin/logout",
        "/admin/%6cogout",
        "/admin/LOGOUT",
        "/projects/%00",
        "/projects/%20",
        "/projects\\evil",
    ] {
        assert!(safe_return_to(path).is_none());
    }
    assert!(
        BrowserConfig::new(
            "https://console.example.invalid",
            "https://auth.example.invalid/api/auth",
            "first-party".into(),
            "retained-client-secret".into()
        )
        .is_ok()
    );
    assert!(
        BrowserConfig::new(
            "https://user@console.example.invalid",
            "https://auth.example.invalid/api/auth",
            "first-party".into(),
            "secret".into()
        )
        .is_err()
    );
}
