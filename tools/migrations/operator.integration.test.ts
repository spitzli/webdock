import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { runtimeRoles } from "./config";
import { oauthSecretHash } from "./operator-provision";
const root = fileURLToPath(new URL("../../", import.meta.url));
test(
  "initial operator bootstrap plus real MFA/PKCE and composed core API with all products disabled",
  { skip: process.env.WEBDOCK_TEST_OPERATOR !== "true", timeout: 180000 },
  async () => {
    const endpoint = execFileSync(
      "docker",
      ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
      { encoding: "utf8" },
    ).trim();
    assert.ok(endpoint.startsWith("unix://"));
    const dockerEnv: NodeJS.ProcessEnv = {
      ...process.env,
      DOCKER_HOST: endpoint,
    };
    delete dockerEnv.DOCKER_CONTEXT;
    const name = "webdock-operator-test-" + randomBytes(6).toString("hex"),
      password = randomBytes(32).toString("hex");
    const docker = (args: string[]) =>
      execFileSync("docker", args, { encoding: "utf8", env: dockerEnv }).trim();
    const dir = await mkdtemp(join(tmpdir(), "webdock-operator-"));
    docker([
      "run",
      "-d",
      "--name",
      name,
      "--label",
      "webdock.operator-fixture=" + name,
      "-e",
      "POSTGRES_PASSWORD=" + password,
      "-e",
      "POSTGRES_DB=webdock_operator_test",
      "-p",
      "127.0.0.1::5432",
      "postgres:18-alpine",
    ]);
    let owner: Pool | undefined;
    try {
      const port = docker(["port", name, "5432/tcp"]).split(":").at(-1)!;
      const url = new URL(
        `postgresql://postgres:${password}@127.0.0.1:${port}/webdock_operator_test`,
      );
      owner = new Pool({ connectionString: url.href, max: 1 });
      for (let n = 0; ; n++) {
        try {
          await owner.query("SELECT 1");
          break;
        } catch {
          if (n >= 60) throw Error("Fixture startup failed");
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      const passwords = Object.fromEntries(
        [...runtimeRoles, "webdock_offline_migrate"].map((role) => [
          role,
          randomBytes(32).toString("hex"),
        ]),
      );
      const base = {
        PATH: process.env.PATH!,
        HOME: process.env.HOME!,
        DATABASE_URL_UNPOOLED: url.href,
        DATABASE_CONTEXT_SECRET: randomBytes(48).toString("hex"),
        BETTER_AUTH_URL: "https://auth.example.test",
        WEBDOCK_STUDIO_ORIGIN: "https://studio.example.test",
        WEBDOCK_CONSOLE_ORIGIN: "https://console.example.test",
      };
      const target = `127.0.0.1:${port}/webdock_operator_test`;
      const run = (
        script: string,
        args: string[],
        env: Record<string, string>,
      ) =>
        spawnSync(
          root + "node_modules/.bin/bun",
          ["--no-env-file", "tools/migrations/" + script, target, ...args],
          {
            cwd: root,
            encoding: "utf8",
            env: { ...env, NODE_ENV: "development" },
          },
        );
      const install = run("install.ts", [], {
        ...base,
        WEBDOCK_BOOTSTRAP_EMPTY_DATABASE: "true",
        MIGRATION_ROLE_PASSWORDS: JSON.stringify(passwords),
      });
      assert.equal(install.status, 0, install.stdout + install.stderr);
      url.username = "webdock_offline_migrate";
      url.password = passwords.webdock_offline_migrate;
      const env = { ...base, DATABASE_URL_UNPOOLED: url.href },
        input = join(dir, "input.json"),
        output = join(dir, "secrets.json");
      const operatorPassword = randomBytes(24).toString("base64url");
      await writeFile(
        input,
        JSON.stringify({
          email: "operator@example.test",
          name: "Fixture operator",
          password: operatorPassword,
          authOrigin: base.BETTER_AUTH_URL,
          studioOrigin: base.WEBDOCK_STUDIO_ORIGIN,
          consoleOrigin: base.WEBDOCK_CONSOLE_ORIGIN,
        }),
        { mode: 0o600 },
      );
      // An existing unrelated user is preserved. Initial setup may not email-link an existing identity.
      await owner.query(
        `INSERT INTO webdock_auth."user"(name,email,"emailVerified",role,"twoFactorEnabled","mustChangePassword") VALUES('Existing','operator@example.test',true,'user',false,false)`,
      );
      const collision = run("operator.ts", [input, output], env);
      assert.notEqual(collision.status, 0);
      assert.match(collision.stderr, /automatic linking is forbidden/);
      assert.equal(
        (
          await owner.query(
            'SELECT count(*)::int n FROM webdock_auth."oauthClient"',
          )
        ).rows[0].n,
        0,
      );
      await owner.query(
        `UPDATE webdock_auth."user" SET email='existing@example.test' WHERE email='operator@example.test'`,
      );
      const result = run("operator.ts", [input, output], env);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const secrets = JSON.parse(await readFile(output, "utf8"));
      assert.equal((await stat(output)).mode & 0o777, 0o600);
      assert.ok(
        !result.stdout.includes(operatorPassword) &&
          !result.stderr.includes(operatorPassword),
      );
      assert.ok(
        !result.stdout.includes(secrets.environment.WEBDOCK_SSO_CLIENT_SECRET),
      );
      const user = (
        await owner.query(
          `SELECT u.*,a.password FROM webdock_auth."user" u JOIN webdock_auth.account a ON a."userId"=u.id WHERE u.id=$1`,
          [secrets.operatorID],
        )
      ).rows[0];
      assert.equal(user.role, "operator");
      assert.equal(user.twoFactorEnabled, false);
      assert.equal(user.mustChangePassword, true);
      const require = createRequire(
        new URL("../../apps/control-plane/package.json", import.meta.url),
      );
      const crypto = await import(require.resolve("better-auth/crypto"));
      assert.equal(
        await crypto.verifyPassword({
          hash: user.password,
          password: operatorPassword,
        }),
        true,
      );
      assert.equal(
        (await owner.query("SELECT count(*)::int n FROM webdock_auth.session"))
          .rows[0].n,
        0,
      );
      assert.equal(
        (
          await owner.query(
            'SELECT count(*)::int n FROM webdock_auth."twoFactor"',
          )
        ).rows[0].n,
        0,
      );
      const client = (
        await owner.query(
          'SELECT * FROM webdock_auth."oauthClient" WHERE "clientId"=$1',
          [secrets.clientID],
        )
      ).rows[0];
      assert.equal(
        client.clientSecret,
        oauthSecretHash(secrets.environment.WEBDOCK_SSO_CLIENT_SECRET),
      );
      assert.equal(client.requirePKCE, true);
      assert.deepEqual(client.redirectUris, [
        "https://studio.example.test/api/sso/callback",
      ]);
      assert.equal(
        client.metadata.webdock_initial_setup.checksum,
        secrets.checksum,
      );
      assert.equal(
        (
          await owner.query(
            "SELECT auth_subject FROM webdock_admin.users WHERE id=$1",
            [secrets.portalUserID],
          )
        ).rows[0].auth_subject,
        secrets.operatorID,
      );
      assert.equal(
        (
          await owner.query(
            "SELECT count(*)::int n FROM webdock_auth.access_event WHERE action IN ('operator.bootstrap','console.bootstrap')",
          )
        ).rows[0].n,
        2,
      );
      const roleURL = (role: string) => {
        const value = new URL(url.href);
        value.username = role;
        value.password = passwords[role];
        return value.href;
      };
      const login = spawnSync(
        root + "node_modules/.bin/bun",
        ["--no-env-file", "tools/migrations/operator-auth-fixture.ts"],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...env,
            ...secrets.environment,
            WEBDOCK_TEST_OPERATOR: "true",
            NODE_ENV: "development",
            AUTH_TEST_MAIL: "true",
            BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
            DATABASE_URL: roleURL("webdock_auth_runtime"),
            AUTH_DATABASE_URL: roleURL("webdock_auth_bootstrap"),
            DATABASE_WORKER_URL: roleURL("webdock_worker_runtime"),
            REGISTRY_DATABASE_URL: roleURL("webdock_registry_runtime"),
            WEBDOCK_API_ORIGIN: "https://api.example.test",
            WEBDOCK_API_DOMAINS: "auth,portal,registry",
            WEBDOCK_MODULES: JSON.stringify({ configVersion: 1, modules: {} }),
            DATABASE_RLS_SECRET: base.DATABASE_CONTEXT_SECRET,
            OPERATOR_TEST_PASSWORD: operatorPassword,
            OPERATOR_TEST_SUBJECT: secrets.operatorID,
            OPERATOR_TEST_BINDING: secrets.bindingID,
          },
        },
      );
      assert.equal(login.status, 0, login.stdout + login.stderr);
      const repeat = run("operator.ts", [input, join(dir, "repeat.json")], env);
      assert.notEqual(repeat.status, 0);
      assert.match(repeat.stderr, /already exists/);
      assert.equal(
        (await owner.query('SELECT count(*)::int n FROM webdock_auth."user"'))
          .rows[0].n,
        2,
      );
    } finally {
      await owner?.end();
      assert.equal(
        docker([
          "inspect",
          "--format",
          '{{index .Config.Labels "webdock.operator-fixture"}}',
          name,
        ]),
        name,
      );
      docker(["rm", "-f", name]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);
