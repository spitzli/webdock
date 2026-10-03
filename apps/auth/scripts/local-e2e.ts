import fs from "node:fs";
import crypto from "node:crypto";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
import { createIdentity, registerApplication } from "../src/lib/bootstrap";
if (new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1")
  throw Error("Local fixture only");
try {
  const password = crypto.randomBytes(24).toString("base64url");
  const email = `browser-${crypto.randomBytes(5).toString("hex")}@example.invalid`;
  const user = await createIdentity({
    email,
    name: "Local operator",
    password,
    operator: true,
  });
  const login = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  if (login.status !== 200) throw Error("Fixture login failed");
  const headers = new Headers({
    Cookie: login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  const app = await registerApplication({
    label: "Local Webdock Admin",
    origin: "http://127.0.0.1:3120",
    logoutPath: "/login",
    headers,
  });
  const env = parseEnv(fs.readFileSync("../admin/.env.local", "utf8"));
  const admin = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const result = await admin.query(
      "UPDATE webdock_admin.users SET auth_subject=$1 WHERE role='operator'",
      [user.id],
    );
    if (result.rowCount !== 1)
      throw Error("One local operator projection required");
  } finally {
    await admin.end();
  }
  const settings = {
    ...env,
    WEBDOCK_AUTH_ISSUER: process.env.BETTER_AUTH_URL + "/api/auth",
    WEBDOCK_SSO_CLIENT_ID: app.clientID,
    WEBDOCK_SSO_CLIENT_SECRET: app.clientSecret,
    WEBDOCK_SSO_COOKIE_SECRET: crypto.randomBytes(40).toString("hex"),
    WEBDOCK_SSO_APP_ORIGIN: "http://127.0.0.1:3120",
    WEBDOCK_SSO_ALLOW_LOCAL_HTTP: "true",
    NEXT_PUBLIC_SERVER_URL: "http://127.0.0.1:3120",
  };
  fs.writeFileSync(
    "../admin/.env.sso-test.local",
    Object.entries(settings)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  fs.writeFileSync(
    ".env.browser-fixture",
    JSON.stringify({ email, password, id: user.id }),
    { mode: 0o600 },
  );
  await auth.api.signOut({ headers });
  console.log(
    "Local browser fixture and relying-app settings prepared; no production data or email used.",
  );
} finally {
  await database.end();
}
