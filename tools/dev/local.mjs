// Local development helper used by the root Tiltfile. Owned loopback state only; never deployment config.
// Usage: bun tools/dev/local.mjs secrets|init|plugin-image <id>|seed
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
  // The shared customer database server for the postgres plugin; generated once, like the rest.
  if (!existsSync(file("shared-postgres.env"))) writeFileSync(file("shared-postgres.env"), `POSTGRES_PASSWORD=${secret()}\n`, { mode: 0o600 });
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

// Local plugins: what a reviewed installer would record, plus private co-located Unix sockets.
// Each runs natively from its own workspace (see the Tiltfile); the image in the local registry is
// the release reference the Core pins.
const plugins = join(state, "plugins");
const registry = `127.0.0.1:${process.env.WEBDOCK_DEV_REGISTRY_PORT ?? 5005}`;
const sharedPort = Number(process.env.WEBDOCK_DEV_SHARED_POSTGRES_PORT ?? 55441);
const demo = { customer: "900000000000000101", organization: "900000000000000102", project: "900000000000000103" };
const pluginFile = (name) => join(plugins, name);
const uid = process.getuid();
// storage: the plugin gets its own database and login role in the local server.
// policy: local-dev self-service defaults, so the Demo customer can try every feature.
const PLUGINS = {
  "echo-demo": { policy: { "create-notes": "selected" } },
  postgres: {
    storage: true,
    policy: { "create-shared": "selected", "create-dedicated": "selected" },
    config: (secrets) => ({
      secretKeyHex: secrets.sealKey,
      sharedServers: [{
        id: "local-1", label: "Local shared server", host: "127.0.0.1", port: sharedPort,
        adminUrl: `postgresql://postgres:${readEnv("shared-postgres.env").POSTGRES_PASSWORD}@127.0.0.1:${sharedPort}/postgres`, capacity: 50,
      }],
      dedicated: { dockerSocket: "/var/run/docker.sock", bindHost: "127.0.0.1" },
    }),
  },
};
function readEnv(name) {
  return Object.fromEntries(readFileSync(file(name), "utf8").trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2)));
}
function psql(sql, variables = {}, database = "webdock") {
  const args = [...compose, "exec", "-T", "postgres", "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-tA"];
  for (const [name, value] of Object.entries(variables)) args.push("-v", `${name}=${value}`);
  return execFileSync("docker", args, { input: sql, encoding: "utf8" }).trim();
}
function pluginSecrets(id) {
  const path = pluginFile(`${id}.secrets.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const value = { storage: secret(), sealKey: secret() };
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return value;
}

async function pluginImage(id) {
  mkdirSync(plugins, { recursive: true, mode: 0o700 });
  if (existsSync(pluginFile(`${id}.image`))) {
    // A reset registry volume no longer holds the recorded digest; rebuild instead of seeding a dangling reference.
    const digest = readFileSync(pluginFile(`${id}.image`), "utf8").trim().split("@")[1];
    const head = await fetch(`http://${registry}/v2/webdock/${id}/manifests/${digest}`, {
      method: "HEAD", headers: { Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" },
    }).catch(() => null);
    if (head?.ok) return;
  }
  const tag = `${registry}/webdock/${id}:dev`;
  execFileSync("docker", ["build", "-f", `plugins/${id}/Dockerfile`, "-t", tag, "."], { cwd: root, stdio: "inherit" });
  execFileSync("docker", ["push", tag], { stdio: "inherit" });
  const digests = JSON.parse(execFileSync("docker", ["image", "inspect", "--format", "{{json .RepoDigests}}", tag], { encoding: "utf8" }));
  const pinned = digests.find((value) => value.startsWith(`${registry}/webdock/${id}@sha256:`));
  if (!pinned) throw new Error("Pushed image digest not found");
  writeFileSync(pluginFile(`${id}.image`), pinned, { mode: 0o600 });
}

function storage(id, password) {
  const name = `webdock_plugin_${id.replaceAll("-", "_")}`;
  // The role reaches only its own database; it has no rights in the platform database.
  psql(`SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'name', :'password') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=:'name') \\gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'name', :'password') \\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'name', :'name') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname=:'name') \\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'name') \\gexec`, { name, password });
  return `postgresql://${name}:${password}@127.0.0.1:${port}/${name}`;
}

function seedPlugin(id, credential) {
  const options = PLUGINS[id];
  // The stored release keeps its image across rebuilds. A changed repository manifest replaces the
  // local dev release in place: shadow mode has no upgrade path to preserve.
  const stored = psql("SELECT manifest_bytes FROM webdock_auth.plugin_release WHERE plugin_id=:'id'", { id });
  const value = JSON.parse(readFileSync(join(root, `plugins/${id}/manifest.json`), "utf8"));
  value.image = stored ? JSON.parse(stored).image : readFileSync(pluginFile(`${id}.image`), "utf8").trim();
  const manifest = JSON.stringify(value);
  writeFileSync(pluginFile(`${id}.manifest.json`), manifest, { mode: 0o644 });
  const policies = Object.entries(options.policy ?? {}).map(([feature, mode]) => `
INSERT INTO webdock_auth.plugin_feature_policy(plugin_id,feature_id,mode,updated_by) VALUES(:'id','${feature}','${mode}','local-dev') ON CONFLICT DO NOTHING;
INSERT INTO webdock_auth.plugin_feature_customer(plugin_id,feature_id,customer_id,added_by) VALUES(:'id','${feature}',:'customer','local-dev') ON CONFLICT DO NOTHING;`).join("");
  psql(`BEGIN;
INSERT INTO webdock_auth.plugin_installation(id,kind,state,desired_state,version,runtime,current_generation) VALUES(:'id','external','enabled','enabled',:'version','ready',1) ON CONFLICT DO NOTHING;
INSERT INTO webdock_auth.plugin_release(plugin_id,version,manifest_bytes,manifest_sha256,image,registry_url,signer_key_id) VALUES(:'id',:'version',:'manifest',encode(sha256(convert_to(:'manifest','UTF8')),'hex'),:'image',:'registry','local-dev') ON CONFLICT (plugin_id,version) DO UPDATE SET manifest_bytes=EXCLUDED.manifest_bytes,manifest_sha256=EXCLUDED.manifest_sha256 WHERE webdock_auth.plugin_release.manifest_bytes IS DISTINCT FROM EXCLUDED.manifest_bytes;
INSERT INTO webdock_auth.plugin_configuration(plugin_id,approved_capabilities,configuration) VALUES(:'id','[]','{}') ON CONFLICT DO NOTHING;
INSERT INTO webdock_auth.plugin_runtime(plugin_id,generation,version,image,status,configuration_revision,credential_hash,namespace,service_name) VALUES(:'id',1,:'version',:'image','ready',0,:'credential','local',:'id') ON CONFLICT (plugin_id,generation) DO UPDATE SET credential_hash=EXCLUDED.credential_hash;
${policies}
COMMIT;`, { id, version: value.version, manifest, image: value.image, credential, registry: `http://${registry}`, customer: demo.customer });
  const secrets = pluginSecrets(id);
  writeFileSync(pluginFile(`${id}.json`), JSON.stringify({
    manifest: pluginFile(`${id}.manifest.json`), issuerPublicKeyHex: readFileSync(pluginFile("invocation.pub"), "utf8"),
    generation: 1, listen: pluginFile(`${id}.sock`), core: pluginFile("control.sock"), corePeers: [{ kind: "unix", uid }],
    ...(options.storage ? { storageUrl: storage(id, secrets.storage) } : {}),
    ...(options.config ? options.config(secrets) : {}),
  }), { mode: 0o600 });
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
  psql(`BEGIN;
SELECT set_config('webdock.organization_allocation', json_build_object('customer_id', :'customer', 'organization_id', :'organization')::text, true);
INSERT INTO webdock_admin.customers(id,name) SELECT :'customer','Demo customer' WHERE NOT EXISTS(SELECT 1 FROM webdock_admin.customers WHERE id=:'customer');
INSERT INTO webdock_admin.projects(id,name,customer_id) SELECT :'project','Demo project',:'customer' WHERE NOT EXISTS(SELECT 1 FROM webdock_admin.projects WHERE id=:'project');
INSERT INTO webdock_auth.plugin_bootstrap(singleton,mode) VALUES(true,'fresh') ON CONFLICT DO NOTHING;
COMMIT;`, demo);
  const credential = createHash("sha256").update(readFileSync(pluginFile("credential"), "utf8")).digest("hex");
  for (const id of Object.keys(PLUGINS)) seedPlugin(id, credential);
  const runtimes = (entry) => Object.fromEntries(Object.keys(PLUGINS).map((id) => [id, entry(id)]));
  writeFileSync(pluginFile("host-bindings.json"), JSON.stringify({ runtimes: runtimes((id) => ({
    generation: 1, namespace: "local", service: id, credentialSha256: credential, peers: [{ kind: "unix", uid }],
  })) }), { mode: 0o600 });
  writeFileSync(pluginFile("connections.json"), JSON.stringify({ runtimes: runtimes((id) => ({
    generation: 1, transport: { kind: "unix", path: pluginFile(`${id}.sock`) },
  })) }), { mode: 0o600 });
  writeFileSync(pluginFile("plugin-config.json"), JSON.stringify({
    hostBindings: pluginFile("host-bindings.json"), invocationSigningKey: pluginFile("invocation.key"),
    connections: pluginFile("connections.json"), control: { kind: "unix", path: pluginFile("control.sock") },
  }), { mode: 0o600 });
  console.log(`Seeded Demo customer ${demo.customer} / Demo project ${demo.project} with ${Object.keys(PLUGINS).join(", ")}.`);
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
else if (command === "plugin-image") await pluginImage(process.argv[3] ?? "echo-demo");
else if (command === "seed") { seed(); writeEnv(value); }
else if (command !== "secrets") throw new Error("Use: secrets | init | plugin-image | seed");
