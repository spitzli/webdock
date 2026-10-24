#[test]
fn startup_failure_does_not_echo_arguments_or_underlying_diagnostics() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_webdock-mail"))
        .arg("/fixture-private-configuration-marker")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(
        output.stderr == b"mail_plugin_start_failed\n",
        "unexpected startup diagnostics; contents withheld"
    );
}
