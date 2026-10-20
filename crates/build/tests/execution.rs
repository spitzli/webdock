use std::{
    process::Command,
    time::{Duration, Instant},
};
use webdock_build::execution::{MAX_LOG, run_bounded};
#[test]
fn host_watchdog_kills_process_and_bounds_output() {
    let mut sleeper = Command::new("/bin/sleep");
    sleeper.arg("30");
    let started = Instant::now();
    let failed = run_bounded(&mut sleeper, Duration::from_millis(100), 1024, &mut || {
        Ok(())
    })
    .unwrap_err();
    assert_eq!(failed.code, "execution_timeout");
    assert!(started.elapsed() < Duration::from_secs(2));
    let mut noisy = Command::new("/usr/bin/yes");
    noisy.arg("authored-host-watchdog-fixture");
    let failed = run_bounded(&mut noisy, Duration::from_secs(2), 1024, &mut || Ok(())).unwrap_err();
    assert_eq!(failed.code, "log_limit");
    assert!(failed.logs.len() <= MAX_LOG);
    let mut revoked = Command::new("/bin/sleep");
    revoked.arg("30");
    let failed = run_bounded(&mut revoked, Duration::from_secs(2), 1024, &mut || {
        Err(webdock_build::Error {
            code: "lease_revoked",
            logs: String::new(),
        })
    })
    .unwrap_err();
    assert_eq!(failed.code, "lease_revoked");
}
#[test]
fn host_watchdog_limits_writable_file_growth() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("limited-output");
    let mut command = Command::new("/bin/sh");
    command
        .args([
            "-c",
            "exec /bin/dd if=/dev/zero of=\"$1\" bs=4096 count=1000",
            "fixture",
        ])
        .arg(&target);
    assert!(run_bounded(&mut command, Duration::from_secs(2), 1024, &mut || Ok(())).is_err());
    assert!(std::fs::metadata(target).unwrap().len() <= 1024);
}
