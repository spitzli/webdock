// Local development helper used by the root Tiltfile. Owned loopback state only; never deployment config.
// Usage: bun tools/dev/local.mjs secrets|init|plugin-image|seed
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const state = join(root, ".dev-local");
const compose = ["compose", "-f", join(root, "deploy/dev/compose.yaml")];
const port = Number(process.env.WEBDOCK_DEV_POSTGRES_PORT ?? 55440);
const target = `127.0.0.1:${port}/webdock`;
// WEBDOCK_DEV_HTTPS=1 serves Console and account pages over HTTPS (some password managers refuse
// passkeys on plain-HTTP localhost). Origins are recorded at bootstrap, so switching needs a reset.
const https = process.env.WEBDOCK_DEV_HTTPS === "1";
const scheme = https ? "https" : "http";
const origins = {
  WEBDOCK_API_ORIGIN: "http://127.0.0.1:3130",
  WEBDOCK_AUTH_ORIGIN: `${scheme}://localhost:3125`,
  WEBDOCK_STUDIO_ORIGIN: `${scheme}://127.0.0.1:3120`,
  WEBDOCK_CONSOLE_ORIGIN: `${scheme}://127.0.0.1:3121`,
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

function tls() {
  const dir = join(state, "tls");
  if (!https || existsSync(join(dir, "cert.pem"))) return;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    execFileSync("mkcert", ["-cert-file", join(dir, "cert.pem"), "-key-file", join(dir, "key.pem"), "localhost", "127.0.0.1"], { stdio: "inherit" });
  } catch {
    throw new Error("WEBDOCK_DEV_HTTPS=1 needs mkcert with its local CA installed: install mkcert, run `mkcert -install` once, then restart Tilt.");
  }
}
function secrets() {
  mkdirSync(state, { recursive: true, mode: 0o700 });
  tls();
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
  if (existsSync(file("initial-secrets.json"))) {
    // Sign-in redirect URIs were registered with the scheme used at bootstrap.
    const recorded = existsSync(file("scheme")) ? readFileSync(file("scheme"), "utf8").trim() : "http";
    if (recorded !== scheme) throw new Error(`This database was set up for ${recorded}. Reset it (docker compose -f deploy/dev/compose.yaml -p webdock-dev down -v && rm -rf .dev-local) to switch to ${scheme}.`);
    return;
  }
  privateJSON("operator.json", {
    email: "operator@example.test", name: "Local operator", password: value.operatorPassword,
    authOrigin: origins.WEBDOCK_AUTH_ORIGIN, studioOrigin: origins.WEBDOCK_STUDIO_ORIGIN, consoleOrigin: origins.WEBDOCK_CONSOLE_ORIGIN,
  });
  run("webdock-bootstrap-operator", ["--target", target, "--config", file("operator.json"), "--output", file("initial-secrets.json")], {
    ...origins, WEBDOCK_AUTH_SECRET: value.auth, DATABASE_URL_UNPOOLED: url("webdock_offline_migrate", value.roles.webdock_offline_migrate),
  });
  writeFileSync(file("scheme"), scheme, { mode: 0o600 });
  console.log(`Local operator: operator@example.test / ${value.operatorPassword} (password change and MFA are required at first sign-in)`);
}

// Local demo plugin: what a reviewed installer would record, plus private co-located Unix sockets.
const plugins = join(state, "plugins");
const registry = `127.0.0.1:${process.env.WEBDOCK_DEV_REGISTRY_PORT ?? 5005}`;
const demo = { customer: "900000000000000101", organization: "900000000000000102", project: "900000000000000103" };
const pluginFile = (name) => join(plugins, name);
const uid = process.getuid();
function psql(sql, variables = {}) {
  const args = [...compose, "exec", "-T", "postgres", "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "webdock", "-v", "ON_ERROR_STOP=1", "-tA"];
  for (const [name, value] of Object.entries(variables)) args.push("-v", `${name}=${value}`);
  return execFileSync("docker", args, { input: sql, encoding: "utf8" }).trim();
}

async function pluginImage() {
  mkdirSync(plugins, { recursive: true, mode: 0o700 });
  if (existsSync(pluginFile("echo-demo.image"))) {
    // A reset registry volume no longer holds the recorded digest; rebuild instead of seeding a dangling reference.
    const digest = readFileSync(pluginFile("echo-demo.image"), "utf8").trim().split("@")[1];
    const head = await fetch(`http://${registry}/v2/webdock/echo-demo/manifests/${digest}`, {
      method: "HEAD", headers: { Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" },
    }).catch(() => null);
    if (head?.ok) return;
  }
  const tag = `${registry}/webdock/echo-demo:dev`;
  execFileSync("docker", ["build", "-f", "plugins/echo-demo/Dockerfile", "-t", tag, "."], { cwd: root, stdio: "inherit" });
  execFileSync("docker", ["push", tag], { stdio: "inherit" });
  const digests = JSON.parse(execFileSync("docker", ["image", "inspect", "--format", "{{json .RepoDigests}}", tag], { encoding: "utf8" }));
  const pinned = digests.find((value) => value.startsWith(`${registry}/webdock/echo-demo@sha256:`));
  if (!pinned) throw new Error("Pushed image digest not found");
  writeFileSync(pluginFile("echo-demo.image"), pinned, { mode: 0o600 });
}

function seed() {
  waitForDatabase();
  mkdirSync(plugins, { recursive: true, mode: 0o700 });
  if (!existsSync(pluginFile("invocation.key"))) {
    const keys = generateKeyPairSync("ed25519");
    const raw = (part) => Buffer.from(keys.privateKey.export({ format: "jwk" })[part], "base64url").toString("hex");
    writeFileSync(pluginFile("invocation.key"), raw("d"), { mode: 0o600 });
    writeFileSync(pluginFile("invocation.pub"), raw("x"), { mode: 0o600 });
    writeFileSync(pluginFile("credential"), secret(), { mode: 0o600 });
  }
  // The stored release is authoritative; later image rebuilds never silently rewrite it.
  let manifest = psql("SELECT manifest_bytes FROM webdock_auth.plugin_release WHERE plugin_id='echo-demo'");
  if (!manifest) {
    const value = JSON.parse(readFileSync(join(root, "plugins/echo-demo/manifest.json"), "utf8"));
    value.image = readFileSync(pluginFile("echo-demo.image"), "utf8").trim();
    manifest = JSON.stringify(value);
  }
  writeFileSync(pluginFile("echo-demo.manifest.json"), manifest, { mode: 0o644 });
  const credential = createHash("sha256").update(readFileSync(pluginFile("credential"), "utf8")).digest("hex");
  const image = JSON.parse(manifest).image;
  psql(`BEGIN;
SELECT set_config('webdock.organization_allocation', json_build_object('customer_id', :'customer', 'organization_id', :'organization')::text, true);
INSERT INTO webdock_admin.customers(id,name) SELECT :'customer','Demo customer' WHERE NOT EXISTS(SELECT 1 FROM webdock_admin.customers WHERE id=:'customer');
INSERT INTO webdock_admin.projects(id,name,customer_id) SELECT :'project','Demo project',:'customer' WHERE NOT EXISTS(SELECT 1 FROM webdock_admin.projects WHERE id=:'project');
INSERT INTO webdock_auth.plugin_bootstrap(singleton,mode) VALUES(true,'fresh') ON CONFLICT DO NOTHING;
INSERT INTO webdock_auth.plugin_installation(id,kind,state,desired_state,version,runtime,current_generation) VALUES('echo-demo','external','enabled','enabled','0.1.0','ready',1) ON CONFLICT DO NOTHING;
INSERT INTO webdock_auth.plugin_release(plugin_id,version,manifest_bytes,manifest_sha256,image,registry_url,signer_key_id) SELECT 'echo-demo','0.1.0',:'manifest',encode(sha256(convert_to(:'manifest','UTF8')),'hex'),:'image',:'registry','local-dev' WHERE NOT EXISTS(SELECT 1 FROM webdock_auth.plugin_release WHERE plugin_id='echo-demo');
INSERT INTO webdock_auth.plugin_configuration(plugin_id,approved_capabilities,configuration) VALUES('echo-demo','[]','{}') ON CONFLICT DO NOTHING;
INSERT INTO webdock_auth.plugin_runtime(plugin_id,generation,version,image,status,configuration_revision,credential_hash,namespace,service_name) SELECT 'echo-demo',1,'0.1.0',:'image','ready',0,:'credential','local','echo-demo' WHERE NOT EXISTS(SELECT 1 FROM webdock_auth.plugin_runtime WHERE plugin_id='echo-demo');
COMMIT;`, { ...demo, manifest, image, credential, registry: `http://${registry}` });
  const sockets = (name) => pluginFile(name);
  writeFileSync(pluginFile("host-bindings.json"), JSON.stringify({ runtimes: { "echo-demo": {
    generation: 1, namespace: "local", service: "echo-demo", credentialSha256: credential, peers: [{ kind: "unix", uid }],
  } } }), { mode: 0o600 });
  writeFileSync(pluginFile("connections.json"), JSON.stringify({ runtimes: { "echo-demo": {
    generation: 1, transport: { kind: "unix", path: sockets("echo-demo.sock") },
  } } }), { mode: 0o600 });
  writeFileSync(pluginFile("plugin-config.json"), JSON.stringify({
    hostBindings: pluginFile("host-bindings.json"), invocationSigningKey: pluginFile("invocation.key"),
    connections: pluginFile("connections.json"), control: { kind: "unix", path: sockets("control.sock") },
  }), { mode: 0o600 });
  writeFileSync(pluginFile("echo-demo.json"), JSON.stringify({
    manifest: pluginFile("echo-demo.manifest.json"), issuerPublicKeyHex: readFileSync(pluginFile("invocation.pub"), "utf8"),
    generation: 1, listen: sockets("echo-demo.sock"), core: sockets("control.sock"), corePeers: [{ kind: "unix", uid }],
  }), { mode: 0o600 });
  console.log(`Seeded Demo customer ${demo.customer} / Demo project ${demo.project} with the echo-demo extension (${image}).`);
}

function runtimeEnv(value) {
  const bootstrap = JSON.parse(readFileSync(file("initial-secrets.json"), "utf8"));
  return {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", RUST_LOG: process.env.RUST_LOG ?? "info",
    ...bootstrap.environment, ...origins,
    WEBDOCK_DATABASE_URL: url("webdock_auth_bootstrap", value.roles.webdock_auth_bootstrap),
    WEBDOCK_SESSION_DATABASE_URL: url("webdock_auth_runtime", value.roles.webdock_auth_runtime),
    WEBDOCK_REGISTRY_DATABASE_URL: url("webdock_registry_runtime", value.roles.webdock_registry_runtime),
    WEBDOCK_WORKER_DATABASE_URL: url("webdock_worker_runtime", value.roles.webdock_worker_runtime),
    WEBDOCK_AUTH_SECRET: value.auth, DATABASE_RLS_SECRET: value.rls,
    WEBDOCK_FEATURES: process.env.WEBDOCK_DEV_FEATURES ?? "{}",
    WEBDOCK_BIND_ADDRESS: "127.0.0.1", PORT: "3130",
    WEBDOCK_ACCOUNT_SMTP: `127.0.0.1:${process.env.WEBDOCK_DEV_SMTP_PORT ?? 55025}`,
    ...(existsSync(pluginFile("plugin-config.json")) ? { WEBDOCK_NATIVE_PLUGIN_CONFIG: pluginFile("plugin-config.json") } : {}),
  };
}
// Tilt execs the binaries directly with this file, so stopping Tilt never orphans a server.
function writeEnv(value) {
  const quote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;
  const lines = Object.entries(runtimeEnv(value)).filter(([key]) => !["PATH", "HOME"].includes(key)).map(([key, text]) => `${key}=${quote(text)}`);
  writeFileSync(file("runtime.env"), lines.join("\n") + "\n", { mode: 0o600 });
}

const command = process.argv[2];
const value = secrets();
if (command === "init") init(value);
else if (command === "plugin-image") await pluginImage();
else if (command === "seed") { seed(); writeEnv(value); }
else if (command !== "secrets") throw new Error("Use: secrets | init | plugin-image | seed");
