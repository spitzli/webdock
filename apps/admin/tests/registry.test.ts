import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { closeSnowflakePool } from "../src/lib/snowflake";
const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Only disposable local DB allowed");
test("Registry authorizes operators, preserves ownership and records atomic immutable audit events", async () => {
  const p = await getPayload({ config });
  try {
    await p.db.pool.query(
      "TRUNCATE webdock_admin.audit_events, webdock_admin.cms_instances, webdock_admin.projects, webdock_admin.customers, webdock_admin.users CASCADE",
    );
    const password = crypto.randomBytes(24).toString("base64url");
    const operator = await p.create({
      collection: "users",
      data: {
        name: "Test operator",
        email: "operator@example.invalid",
        password,
        role: "operator",
      },
      overrideAccess: true,
      context: { bootstrap: true },
    });
    const actor = { ...operator, collection: "users" as const };
    const customerUser = await p.create({
      collection: "users",
      data: {
        name: "Customer account",
        email: "customer@example.invalid",
        password,
        role: "admin",
      },
      overrideAccess: true,
      context: { bootstrap: true },
    });
    const untrusted = { ...customerUser, collection: "users" as const };
    const customer = await p.create({
      collection: "customers",
      data: { name: "Example customer", status: "active" },
      overrideAccess: false,
      user: actor,
    });
    assert.match(customer.id, /^[1-9][0-9]{16,18}$/);
    for (const user of [undefined, untrusted]) {
      await assert.rejects(
        p.find({ collection: "customers", overrideAccess: false, user }),
      );
      await assert.rejects(
        p.create({
          collection: "projects",
          data: { name: "No access", customer: customer.id, status: "active" },
          overrideAccess: false,
          user,
        }),
      );
    }
    const project = await p.create({
      collection: "projects",
      data: {
        name: "Example project",
        customer: customer.id,
        status: "active",
      },
      overrideAccess: false,
      user: actor,
    });
    assert.equal(
      (await p.count({ collection: "cms-instances", overrideAccess: true }))
        .totalDocs,
      0,
      "New project must not create a CMS",
    );
    await assert.rejects(
      p.update({
        collection: "customers",
        id: customer.id,
        data: { status: "archived" },
        overrideAccess: false,
        user: actor,
      }),
    );
    await assert.rejects(
      p.create({
        collection: "projects",
        data: {
          name: "Unsafe URL",
          customer: customer.id,
          url: "javascript:alert(1)",
          status: "active",
        },
        overrideAccess: false,
        user: actor,
      }),
    );
    const instance = await p.create({
      collection: "cms-instances",
      data: {
        label: "Already deployed",
        project: project.id,
        adminURL: "https://example.com/admin",
        schemaName: "example",
        providerProjectID: "prj_example",
        template: "custom",
        provider: "vercel",
        status: "active",
      },
      overrideAccess: false,
      user: actor,
    });
    await assert.rejects(
      p.create({
        collection: "cms-instances",
        data: {
          label: "Duplicate",
          project: project.id,
          adminURL: "https://example.com/admin",
          schemaName: "example_duplicate",
          providerProjectID: "prj_duplicate",
          template: "custom",
          provider: "vercel",
          status: "active",
        },
        overrideAccess: false,
        user: actor,
      }),
    );
    const other = await p.create({
      collection: "projects",
      data: { name: "Other project", customer: customer.id, status: "active" },
      overrideAccess: false,
      user: actor,
    });
    await assert.rejects(
      p.update({
        collection: "cms-instances",
        id: instance.id,
        data: { project: other.id },
        overrideAccess: false,
        user: actor,
      }),
    );
    await assert.rejects(
      p.update({
        collection: "projects",
        id: project.id,
        data: { status: "archived" },
        overrideAccess: false,
        user: actor,
      }),
    );
    const logs = await p.find({
      collection: "audit-events",
      overrideAccess: false,
      user: actor,
      pagination: false,
    });
    assert.equal(logs.totalDocs, 4);
    assert.ok(logs.docs.every((e) => typeof e.id === "string"));
    await assert.rejects(
      p.update({
        collection: "audit-events",
        id: logs.docs[0].id,
        data: { summary: "Forged" },
        overrideAccess: true,
      }),
    );
    await assert.rejects(
      p.create({
        collection: "audit-events",
        data: {
          actor: operator.id,
          action: "create",
          targetCollection: "projects",
          targetID: project.id,
          summary: "Forged",
        },
        overrideAccess: false,
        user: actor,
      }),
    );
    // A real audit failure must roll back its project mutation.
    await p.db.pool.query(
      "ALTER TABLE webdock_admin.audit_events ADD CONSTRAINT test_audit_failure CHECK (summary NOT LIKE '%Rollback probe%') NOT VALID",
    );
    try {
      await assert.rejects(
        p.create({
          collection: "projects",
          data: {
            name: "Rollback probe",
            customer: customer.id,
            status: "active",
          },
          overrideAccess: false,
          user: actor,
        }),
      );
    } finally {
      await p.db.pool.query(
        "ALTER TABLE webdock_admin.audit_events DROP CONSTRAINT test_audit_failure",
      );
    }
    assert.equal(
      (
        await p.count({
          collection: "projects",
          where: { name: { equals: "Rollback probe" } },
          overrideAccess: true,
        })
      ).totalDocs,
      0,
    );
    await p.update({
      collection: "projects",
      id: other.id,
      data: { status: "archived", notes: "Clear this" },
      overrideAccess: false,
      user: actor,
    });
    await p.update({
      collection: "cms-instances",
      id: instance.id,
      data: { status: "retired" },
      overrideAccess: false,
      user: actor,
    });
    await p.update({
      collection: "projects",
      id: project.id,
      data: { status: "archived" },
      overrideAccess: false,
      user: actor,
    });
    await p.update({
      collection: "customers",
      id: customer.id,
      data: { status: "archived" },
      overrideAccess: false,
      user: actor,
    });
    const cleared = await p.update({
      collection: "projects",
      id: other.id,
      data: { notes: null, name: "Archived project updated" },
      overrideAccess: false,
      user: actor,
    });
    assert.equal(cleared.notes, null);
    await assert.rejects(
      p.update({
        collection: "users",
        id: operator.id,
        data: { password: "forbidden-new-password" },
        overrideAccess: false,
        user: untrusted,
      }),
    );
  } finally {
    await p.destroy();
    await closeSnowflakePool();
  }
});
