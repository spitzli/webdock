import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { closeSnowflakePool } from "../src/lib/snowflake";
import {
  vercelSchemaSQL,
  saveVercelConnection,
  loadVercelConnection,
  removeVercelConnection,
  saveVercelLink,
  loadVercelLink,
} from "../src/lib/vercel-store";
const db = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost"].includes(db.hostname) ||
  db.pathname !== "/webdock_admin_test"
)
  throw Error("Disposable local DB only");
test("Vercel credentials stay encrypted and operator-only; mapping writes are audited and independent of CMS", async () => {
  const p = await getPayload({ config });
  const teamID = "team_fixture",
    secret = randomBytes(48).toString("hex");
  try {
    await p.db.pool.query(vercelSchemaSQL);
    const user = await p.create({
      collection: "users",
      data: {
        name: "Vercel test",
        email: `vercel-${Date.now()}@example.invalid`,
        password: randomBytes(24).toString("hex"),
        role: "operator",
      },
      overrideAccess: true,
      context: { bootstrap: true },
    });
    const actor = {
      payload: p,
      user: { ...user, collection: "users" as const },
    };
    const customer = await p.create({
      collection: "customers",
      data: { name: "Vercel-only customer", status: "active" },
      user: actor.user,
      overrideAccess: false,
    });
    const project = await p.create({
      collection: "projects",
      data: {
        name: "Vercel-only project",
        customer: customer.id,
        status: "active",
      },
      user: actor.user,
      overrideAccess: false,
    });
    await assert.rejects(
      saveVercelConnection(
        { ...actor, user: { ...actor.user, role: "admin" } },
        {
          teamID,
          configurationID: "icfg_fixture",
          accessToken: "secret-token",
        },
        secret,
      ),
    );
    await saveVercelConnection(
      actor,
      { teamID, configurationID: "icfg_fixture", accessToken: "secret-token" },
      secret,
    );
    const row = (
      await p.db.pool.query(
        "SELECT encrypted_token FROM webdock_admin.vercel_connection WHERE team_id=$1",
        [teamID],
      )
    ).rows[0];
    assert.equal(row.encrypted_token.includes("secret-token"), false);
    assert.equal(
      (await loadVercelConnection(actor, teamID, secret))?.accessToken,
      "secret-token",
    );
    await assert.rejects(
      loadVercelConnection(actor, teamID, randomBytes(48).toString("hex")),
    );
    await saveVercelLink(actor, project.id, teamID, "prj_fixture");
    assert.equal(
      await loadVercelLink(actor, project.id, teamID),
      "prj_fixture",
    );
    const audit = await p.find({
      collection: "audit-events",
      where: { targetID: { equals: project.id } },
      user: actor.user,
      overrideAccess: false,
    });
    assert.ok(audit.docs.some((event) => event.summary.includes("Vercel")));
    await p.db.pool.query(
      "ALTER TABLE webdock_admin.audit_events ADD CONSTRAINT vercel_audit_probe CHECK (summary NOT LIKE '%Vercel%') NOT VALID",
    );
    try {
      await assert.rejects(
        saveVercelLink(actor, project.id, teamID, "prj_other"),
      );
      assert.equal(
        await loadVercelLink(actor, project.id, teamID),
        "prj_fixture",
      );
      await assert.rejects(
        saveVercelConnection(
          actor,
          {
            teamID,
            configurationID: "icfg_other",
            accessToken: "replacement-token",
          },
          secret,
        ),
      );
      assert.equal(
        (await loadVercelConnection(actor, teamID, secret))?.accessToken,
        "secret-token",
      );
    } finally {
      await p.db.pool.query(
        "ALTER TABLE webdock_admin.audit_events DROP CONSTRAINT vercel_audit_probe",
      );
    }
    await p.update({
      collection: "projects",
      id: project.id,
      data: { status: "archived" },
      user: actor.user,
      overrideAccess: false,
    });
    await assert.rejects(
      saveVercelLink(actor, project.id, teamID, "prj_other"),
    );
    await removeVercelConnection(actor, teamID);
    assert.equal(await loadVercelConnection(actor, teamID, secret), null);
    assert.equal(
      await loadVercelLink(actor, project.id, teamID),
      "prj_fixture",
      "Disconnect preserves project inventory",
    );
  } finally {
    await p.db.pool.query(
      "DELETE FROM webdock_admin.vercel_project_link WHERE team_id=$1",
      [teamID],
    );
    await p.db.pool.query(
      "DELETE FROM webdock_admin.vercel_connection WHERE team_id=$1",
      [teamID],
    );
    await p.destroy();
    await closeSnowflakePool();
  }
});
