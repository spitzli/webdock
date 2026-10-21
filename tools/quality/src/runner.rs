//! Explicit command plans; no shell expansion, ambient production configuration or ignored exit.
use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    Contracts,
    Rust,
    Frontend,
    All,
}
impl Scope {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "contracts" => Some(Self::Contracts),
            "rust" => Some(Self::Rust),
            "frontend" => Some(Self::Frontend),
            "all" => Some(Self::All),
            _ => None,
        }
    }
}
pub fn arguments(
    values: &[std::ffi::OsString],
    default_root: PathBuf,
) -> Result<(Scope, PathBuf), String> {
    let (scope, root) = match values {
        [] => (Some(Scope::Contracts), default_root),
        [scope] => (scope.to_str().and_then(Scope::parse), default_root),
        [scope, root] => (scope.to_str().and_then(Scope::parse), PathBuf::from(root)),
        _ => (None, default_root),
    };
    let scope =
        scope.ok_or("Usage: webdock-quality [contracts|rust|frontend|all] [repository-root]")?;
    let root = root
        .canonicalize()
        .map_err(|error| format!("Repository root unavailable: {error}"))?;
    Ok((scope, root))
}
#[derive(Debug, PartialEq, Eq)]
pub struct Check {
    pub program: String,
    pub args: Vec<String>,
}
impl Check {
    fn new(program: &str, args: &[&str]) -> Self {
        Self {
            program: program.into(),
            args: args.iter().map(|s| (*s).into()).collect(),
        }
    }
}
fn rust_checks(manifests: &[PathBuf]) -> Vec<Check> {
    let mut checks = vec![
        Check::new("cargo", &["fmt", "--all", "--", "--check"]),
        Check::new(
            "cargo",
            &[
                "clippy",
                "--workspace",
                "--all-targets",
                "--all-features",
                "--locked",
                "--",
                "-D",
                "warnings",
            ],
        ),
        Check::new(
            "cargo",
            &[
                "clippy",
                "--workspace",
                "--all-targets",
                "--no-default-features",
                "--locked",
                "--",
                "-D",
                "warnings",
            ],
        ),
    ];
    // Cargo feature unification can hide an isolated package's empty/partial-feature errors.
    for features in [None, Some("docker"), Some("kubernetes")] {
        let mut check = Check::new(
            "cargo",
            &[
                "clippy",
                "-p",
                "webdock-agent",
                "--all-targets",
                "--no-default-features",
                "--locked",
            ],
        );
        if let Some(features) = features {
            check.args.extend(["--features".into(), features.into()]);
        }
        check
            .args
            .extend(["--".into(), "-D".into(), "warnings".into()]);
        checks.push(check);
    }
    checks.push(Check::new(
        "cargo",
        &[
            "clippy",
            "-p",
            "webdock-build",
            "--all-targets",
            "--no-default-features",
            "--features",
            "worker",
            "--locked",
            "--",
            "-D",
            "warnings",
        ],
    ));
    checks.push(Check::new(
        "cargo",
        &["test", "--workspace", "--lib", "--all-features", "--locked"],
    ));
    checks.push(Check::new(
        "cargo",
        &[
            "test",
            "-p",
            "webdock-agent-protocol",
            "--tests",
            "--locked",
        ],
    ));
    checks.push(Check::new(
        "cargo",
        &[
            "test",
            "-p",
            "webdock-supervisor",
            "--test",
            "contracts",
            "--no-default-features",
            "--features",
            "journal",
            "--locked",
        ],
    ));
    // These suites use local files and controlled RPC peers. No Engine/cluster access is enabled.
    checks.push(Check::new(
        "cargo",
        &[
            "test",
            "-p",
            "webdock-agent",
            "--test",
            "management",
            "--test",
            "outbox",
            "--test",
            "config",
            "--no-default-features",
            "--locked",
        ],
    ));
    // Pure manifest builders: include both adapters, without executing either runtime.
    checks.push(Check::new(
        "cargo",
        &[
            "test",
            "-p",
            "webdock-agent",
            "--test",
            "policy",
            "--all-features",
            "--locked",
        ],
    ));
    checks.push(Check::new(
        "cargo",
        &[
            "test",
            "-p",
            "webdock-control-plane",
            "--test",
            "http",
            "--test",
            "ui",
            "--test",
            "offline",
            "--test",
            "resource_api",
            "--locked",
        ],
    ));
    checks.push(Check::new(
        "cargo",
        &[
            "test",
            "-p",
            "webdock-plugin-protocol",
            "--test",
            "contracts",
            "--locked",
        ],
    ));
    checks.push(Check::new(
        "cargo",
        &[
            "test",
            "-p",
            "webdock-plugin-runtime",
            "--test",
            "transport",
            "--locked",
        ],
    ));
    for manifest in manifests {
        let path = manifest.to_string_lossy();
        checks.push(Check::new(
            "cargo",
            &["fmt", "--manifest-path", &path, "--", "--check"],
        ));
        checks.push(Check::new(
            "cargo",
            &[
                "clippy",
                "--manifest-path",
                &path,
                "--all-targets",
                "--all-features",
                "--locked",
                "--",
                "-D",
                "warnings",
            ],
        ));
        checks.push(Check::new(
            "cargo",
            &[
                "test",
                "--manifest-path",
                &path,
                "--all-features",
                "--locked",
            ],
        ));
    }
    checks
}
pub fn plan(scope: Scope, standalone_manifests: &[PathBuf]) -> Vec<Check> {
    let mut checks = Vec::new();
    if matches!(scope, Scope::All | Scope::Rust) {
        checks.extend(rust_checks(standalone_manifests));
    }
    if matches!(scope, Scope::All | Scope::Frontend) {
        for script in ["lint", "typecheck", "test", "build", "test:browser"] {
            checks.push(Check::new(
                "bun",
                &["run", "--filter", "@webdock/console-ui", script],
            ));
        }
    }
    checks
}
pub fn execute(root: &Path, checks: &[Check]) -> Result<(), String> {
    if checks.iter().any(|check| check.program == "bun") {
        // Bun is the only JavaScript runtime and package manager; Node is not used by this gate.
        let bun = Command::new("bun")
            .arg("--version")
            .output()
            .map_err(|_| "Bun is required for Console checks".to_owned())?;
        if !bun.status.success() {
            return Err("Bun is required for Console checks".into());
        }
    }
    for check in checks {
        println!("Checking: {} {}", check.program, check.args.join(" "));
        let status = Command::new(&check.program)
            .args(&check.args)
            .current_dir(root)
            .status()
            .map_err(|error| format!("Cannot start {}: {error}", check.program))?;
        if !status.success() {
            return Err(format!(
                "Quality check failed: {} {}",
                check.program,
                check.args.join(" ")
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn command_plan_enforces_features_standalone_plugins_and_all_console_checks() {
        let manifests = [
            PathBuf::from("plugins/provider/Cargo.toml"),
            PathBuf::from("tools/quality/Cargo.toml"),
        ];
        let checks = plan(Scope::All, &manifests);
        assert_eq!(
            checks.iter().filter(|check| check.program == "bun").count(),
            5
        );
        for path in manifests {
            for command in ["fmt", "clippy", "test"] {
                assert!(
                    checks
                        .iter()
                        .any(|check| check.args.first().is_some_and(|s| s == command)
                            && check.args.iter().any(|s| s == path.to_str().unwrap()))
                );
            }
        }
        let isolated = checks
            .iter()
            .filter(|check| {
                check.args.first().is_some_and(|value| value == "clippy")
                    && check.args.iter().any(|s| s == "webdock-agent")
            })
            .collect::<Vec<_>>();
        assert_eq!(isolated.len(), 3);
        assert!(
            isolated
                .iter()
                .all(|check| check.args.iter().any(|s| s == "--no-default-features"))
        );
        assert!(
            checks
                .iter()
                .filter(|check| matches!(
                    check.args.first().map(String::as_str),
                    Some("clippy" | "test")
                ))
                .all(|check| check.args.iter().any(|s| s == "--locked"))
        );
        assert!(plan(Scope::Contracts, &[]).is_empty());
        assert!(
            plan(Scope::Frontend, &[])
                .iter()
                .all(|check| check.program == "bun")
        );
        for package in [
            "webdock-agent-protocol",
            "webdock-supervisor",
            "webdock-agent",
        ] {
            let check = checks
                .iter()
                .find(|check| {
                    check.args.first().is_some_and(|value| value == "test")
                        && check.args.iter().any(|value| value == package)
                })
                .expect("Protocol, supervisor and isolated daemon regressions must run in CI");
            assert!(!check.args.iter().any(|value| value == "--ignored"));
            if package == "webdock-agent" {
                assert!(
                    check
                        .args
                        .iter()
                        .any(|value| value == "--no-default-features")
                );
                for suite in ["management", "outbox", "config"] {
                    assert!(check.args.iter().any(|value| value == suite));
                }
            }
            if package == "webdock-supervisor" {
                assert!(check.args.iter().any(|value| value == "journal"));
            }
        }
        assert!(checks.iter().any(|check| {
            check.args.first().is_some_and(|value| value == "test")
                && check.args.iter().any(|value| value == "policy")
                && check.args.iter().any(|value| value == "--all-features")
        }));
    }
    #[test]
    fn unknown_scope_is_not_silently_replaced() {
        assert_eq!(Scope::parse("all"), Some(Scope::All));
        assert_eq!(Scope::parse("skip-errors"), None);
    }
    #[test]
    fn relative_root_is_resolved_before_manifest_paths_and_working_directory() {
        let (scope, root) =
            arguments(&["rust".into(), ".".into()], PathBuf::from("unused")).unwrap();
        assert_eq!(scope, Scope::Rust);
        assert!(root.is_absolute());
        assert_eq!(
            root,
            std::env::current_dir().unwrap().canonicalize().unwrap()
        );
        assert!(arguments(&["skip-errors".into()], PathBuf::from(".")).is_err());
    }
}
