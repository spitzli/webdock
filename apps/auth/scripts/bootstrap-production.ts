import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseEnv } from "node:util";
import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
import { createIdentity, registerApplication } from "../src/lib/bootstrap";
import { offlineProvisioning } from "../src/lib/offline";
const bootstrapFile = ".env.bootstrap";
const email = process.env.OPERATOR_EMAIL || "dominik@spitzli.dev";
const apps = [
  {
    key: "admin",
    origin: "https://admin.webdock.dev",
    logout: "/login",
    dir: "../admin",
  },
  {
    key: "webdock",
    origin: "https://webdock.dev",
    logout: "/admin/login",
    dir: "../web",
  },
  {
    key: "spitzli",
    origin: "https://spitzli.vercel.app",
    logout: "/admin/login",
    dir: "../../../../spitzli",
  },
  {
    key: "stall",
    origin: "https://www.stall-eichenbruch.de",
    logout: "/admin/login",
    dir: "../../../../../spitzli-backup-roelfs-20261002/stall-eichenbruch",
  },
];
// Paths are explicit operator-side inputs; no untrusted HTTP provisioning endpoint exists.
apps[2].dir = process.env.SPITZLI_INSTANCE_PATH || "../../../spitzli";
apps[3].dir =
  process.env.STALL_INSTANCE_PATH ||
  "/home/newt/Projekte/Personal/spitzli-backup-roelfs-20261002/stall-eichenbruch";
try {
  let stored = fs.existsSync(bootstrapFile)
    ? parseEnv(fs.readFileSync(bootstrapFile, "utf8"))
    : undefined;
  if (!stored) {
    if (
      (
        await database.query(
          'SELECT 1 FROM webdock_auth."user" WHERE email=$1',
          [email],
        )
      ).rowCount
    )
      throw Error(
        "Identity exists without bootstrap file. Refusing to reset credentials.",
      );
    const password = crypto.randomBytes(24).toString("base64url");
    const user = await createIdentity({
      email,
      name: "Dominik",
      password,
      operator: true,
    });
    stored = {
      OPERATOR_EMAIL: email,
      INITIAL_PASSWORD: password,
      AUTH_SUBJECT: user.id,
    };
    fs.writeFileSync(
      bootstrapFile,
      Object.entries(stored)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join("\n") + "\n",
      { mode: 0o600, flag: "wx" },
    );
  }
  if (!stored.INITIAL_PASSWORD || !stored.AUTH_SUBJECT)
    throw Error("Bootstrap file is incomplete");
  const response = await auth.api.signInEmail({
    body: { email, password: stored.INITIAL_PASSWORD },
    asResponse: true,
  });
  if (response.status !== 200)
    throw Error(
      "Bootstrap sign-in unavailable; use an authenticated operator provisioning session after enrollment.",
    );
  const headers = new Headers({
    Cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  const orgs: Record<string, string> = {};
  for (const [name, slug] of [
    ["Spitzli Development", "spitzli-development"],
    ["Stall Eichenbruch", "stall-eichenbruch"],
  ]) {
    let row = (
      await database.query(
        "SELECT id FROM webdock_auth.organization WHERE slug=$1",
        [slug],
      )
    ).rows[0];
    if (!row)
      row = await offlineProvisioning.run({}, () =>
        auth.api.createOrganization({
          headers,
          body: { name, slug, keepCurrentActiveOrganization: true },
        }),
      );
    orgs[slug] = row.id;
  }
  for (const app of apps) {
    const file = path.join(app.dir, ".env.instance");
    const env = parseEnv(fs.readFileSync(file, "utf8"));
    if (!env.WEBDOCK_SSO_CLIENT_ID) {
      const registered = await registerApplication({
        label: app.key,
        origin: app.origin,
        logoutPath: app.logout,
        organizationID:
          app.key === "admin"
            ? undefined
            : orgs[
                app.key === "stall"
                  ? "stall-eichenbruch"
                  : "spitzli-development"
              ],
        headers,
      });
      Object.assign(env, {
        WEBDOCK_AUTH_ISSUER: process.env.BETTER_AUTH_URL + "/api/auth",
        WEBDOCK_SSO_CLIENT_ID: registered.clientID,
        WEBDOCK_SSO_CLIENT_SECRET: registered.clientSecret,
        WEBDOCK_SSO_COOKIE_SECRET: crypto.randomBytes(48).toString("base64url"),
        WEBDOCK_SSO_APP_ORIGIN: app.origin,
        WEBDOCK_SSO_ALLOW_LOCAL_HTTP: "false",
        WEBDOCK_SSO_ENFORCE: app.key === "admin" ? "true" : "false",
      });
    }
    env.OPERATOR_AUTH_SUBJECT = stored.AUTH_SUBJECT;
    fs.writeFileSync(
      file,
      Object.entries(env)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    console.log(app.key + ": private relying-app configuration prepared.");
  }
  await auth.api.signOut({ headers });
  console.log(
    "Operator bootstrap credentials saved privately; password change and MFA enrollment are required before SSO access.",
  );
} finally {
  await database.end();
}
