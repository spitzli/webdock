// Local development helper used by the root Tiltfile. Owned loopback state only; never deployment config.
// Usage: node tools/dev/local.mjs secrets|init|core
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const state = join(root, ".dev-local");
const compose = ["compose", "-f", join(root, "deploy/dev/compose.yaml")];
const port = Number(process.env.WEBDOCK_DEV_POSTGRES_PORT ?? 55440);
const target = `127.0.0.1:${port}/webdock`;
const origins = {
  WEBDOCK_API_ORIGIN: "http://127.0.0.1:3130",
  WEBDOCK_AUTH_ORIGIN: "http://localhost:3125",
  WEBDOCK_STUDIO_ORIGIN: "http://127.0.0.1:3120",
  WEBDOCK_CONSOLE_ORIGIN: "http://127.0.0.1:3121",
};
const roles = [
  "webdock_auth_bootstrap", "webdock_auth_runtime", "webdock_worker_runtime", "webdock_admin_runtime",
  "webdock_registry_runtime", "webdock_runtime", "webdock_browser_website", "webdock_cms_archive_runtime",
  "webdock_offline_migrate",
];
const secret = () => randomBytes(32).toString("hex");
const file = (name) => join(state, name);
function privateJSON(name, value) {
  writeFileSync(file(name), JSON.stringify(value, null, 2), { mode: 0o600 });
}
const url = (role, password) => `postgresql://${role}:${password}@${target}`;

function secrets() {
  mkdirSync(state, { recursive: true, mode: 0o700 });
  if (existsSync(file("secrets.json"))) return JSON.parse(readFileSync(file("secrets.json"), "utf8"));
  const value = {
    postgres: secret(), rls: secret(), auth: secret(), operatorPassword: `Dev-${secret().slice(0, 20)}!`,
    roles: Object.fromEntries(roles.map((role) => [role, secret()])),
  };
  privateJSON("secrets.json", value);
  privateJSON("roles.json", value.roles);
  writeFileSync(file("postgres.env"), `POSTGRES_PASSWORD=${value.postgres}\n`, { mode: 0o600 });
  return value;
}

function waitForDatabase() {
  // Compose reports the container as running while initdb is still creating the database.
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      execFileSync("docker", [...compose, "exec", "-T", "postgres", "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "webdock"], { stdio: "ignore" });
      return;
    } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); }
  }
  throw new Error("Local PostgreSQL did not become ready");
}
function initialized() {
  const sql = "SELECT to_regclass('webdock_auth.user') IS NOT NULL";
  return execFileSync("docker", [...compose, "exec", "-T", "postgres", "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "webdock", "-tAc", sql], { encoding: "utf8" }).trim() === "t";
}

function run(binary, args, env) {
  execFileSync(join(root, "target/debug", binary), args, {
    stdio: "inherit", cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", ...env },
  });
}

function init(value) {
  const admin = { WEBDOCK_MIGRATION_DATABASE_URL: url("postgres", value.postgres), DATABASE_RLS_SECRET: value.rls };
  waitForDatabase();
  if (!initialized()) {
    // A fresh volume invalidates any operator output from a previous database.
    rmSync(file("initial-secrets.json"), { force: true });
    run("webdock-migrate", ["--target", target, "--initialize-empty", "--provision-roles-from", file("roles.json")], admin);
  } else {
    run("webdock-migrate", ["--target", target], admin);
  }
  if (existsSync(file("initial-secrets.json"))) return;
  privateJSON("operator.json", {
    email: "operator@example.test", name: "Local operator", password: value.operatorPassword,
    authOrigin: origins.WEBDOCK_AUTH_ORIGIN, studioOrigin: origins.WEBDOCK_STUDIO_ORIGIN, consoleOrigin: origins.WEBDOCK_CONSOLE_ORIGIN,
  });
  run("webdock-bootstrap-operator", ["--target", target, "--config", file("operator.json"), "--output", file("initial-secrets.json")], {
    ...origins, WEBDOCK_AUTH_SECRET: value.auth, DATABASE_URL_UNPOOLED: url("webdock_offline_migrate", value.roles.webdock_offline_migrate),
  });
  console.log(`Local operator: operator@example.test / ${value.operatorPassword} (password change and MFA are required at first sign-in)`);
}

function core(value) {
  const bootstrap = JSON.parse(readFileSync(file("initial-secrets.json"), "utf8"));
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", RUST_LOG: process.env.RUST_LOG ?? "info",
    ...bootstrap.environment, ...origins,
    WEBDOCK_DATABASE_URL: url("webdock_auth_bootstrap", value.roles.webdock_auth_bootstrap),
    WEBDOCK_SESSION_DATABASE_URL: url("webdock_auth_runtime", value.roles.webdock_auth_runtime),
    WEBDOCK_REGISTRY_DATABASE_URL: url("webdock_registry_runtime", value.roles.webdock_registry_runtime),
    WEBDOCK_WORKER_DATABASE_URL: url("webdock_worker_runtime", value.roles.webdock_worker_runtime),
    WEBDOCK_AUTH_SECRET: value.auth, DATABASE_RLS_SECRET: value.rls,
    WEBDOCK_FEATURES: process.env.WEBDOCK_DEV_FEATURES ?? "{}",
    WEBDOCK_BIND_ADDRESS: "127.0.0.1", PORT: "3130",
  };
  const child = spawn(join(root, "target/debug/webdock-control-plane"), [], { cwd: root, env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

const command = process.argv[2];
const value = secrets();
if (command === "init") init(value);
else if (command === "core") core(value);
else if (command !== "secrets") throw new Error("Use: secrets | init | core");
