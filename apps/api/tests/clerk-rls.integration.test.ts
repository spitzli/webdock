import { test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { withDatabaseScope } from "@webdock/database-runtime";
import { withConsolePrincipal } from "../src/modules/auth/principal";
import { createDatabases } from "../src/db/client";
const fixtureFile = process.env.WEBDOCK_RLS_FIXTURE_FILE;
(fixtureFile ? test : test.skip)(
  "Clerk RLS uses live verified scope without a legacy session",
  async () => {
    const url = new URL(
      process.env.API_TEST_OWNER_URL || process.env.DATABASE_URL || "",
    );
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/webdock_rls_test")
      throw Error("Only isolated fixture allowed");
    const fixture = JSON.parse(await readFile(fixtureFile!, "utf8"));
    const owner = new Pool({ connectionString: url.href, max: 1 });
    const pools = createDatabases({
      environment: "test",
      businessURL: fixture.roles.webdock_auth_runtime,
      authURL: fixture.roles.webdock_auth_bootstrap,
      workerURL: fixture.roles.webdock_worker_runtime,
      signingSecret: fixture.contextSecret,
      max: 1,
    });
    const id = () =>
      "91" + BigInt("0x" + randomBytes(5).toString("hex")).toString();
    const user = id(),
      customer = id(),
      other = id(),
      issuer = "https://fixture.clerk.accounts.dev";
    const storageID="clerk-storage-"+user;
    try {
      const constraintClient = await owner.connect();
      try {
        const constraint = (
          await constraintClient.query(
            "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='webdock_auth.managed_database_launch'::regclass AND conname='managed_database_launch_identity_provider'",
          )
        ).rows[0].definition;
        await constraintClient.query(
          "CREATE TEMP TABLE clerk_viewer_check(session_id text,clerk_identity jsonb)",
        );
        await constraintClient.query(
          "ALTER TABLE clerk_viewer_check ADD " + constraint,
        );
        for (const identity of [
          null,
          { issuer: null, userID: null, sessionID: null, organizationID: null },
          { issuer: 1, userID: 2, sessionID: 3, organizationID: null },
        ])
          await expect(
            constraintClient.query(
              "INSERT INTO clerk_viewer_check VALUES(NULL,$1)",
              [identity],
            ),
          ).rejects.toMatchObject({ code: "23514" });
        await constraintClient.query(
          "INSERT INTO clerk_viewer_check VALUES($1,NULL)",
          ["legacy"],
        );
        await constraintClient.query(
          "INSERT INTO clerk_viewer_check VALUES(NULL,$1)",
          [
            {
              issuer: "https://fixture.test",
              userID: "user",
              sessionID: "session",
              organizationID: null,
            },
          ],
        );
      } finally {
        constraintClient.release();
      }
      await owner.query(
        `INSERT INTO webdock_auth."user"(id,name,email,role,"emailVerified","mustChangePassword") VALUES($1,'Clerk fixture',$2,'user',true,false)`,
        [user, user + "@example.invalid"],
      );
      await owner.query(
        `INSERT INTO webdock_admin.customers(id,name,status) VALUES($1,'Clerk fixture','active'),($2,'Other fixture','active')`,
        [customer, other],
      );
      const org = (
        await owner.query(
          "SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1",
          [customer],
        )
      ).rows[0].organization_id;
      await owner.query(
        "INSERT INTO webdock_auth.clerk_identity VALUES($1,$2,$3,true)",
        [issuer, "user_" + user, user],
      );
      await owner.query(
        "INSERT INTO webdock_auth.clerk_organization VALUES($1,$2,$3,true)",
        [issuer, "org_" + org, org],
      );
      const {legacyClerkMemberships, linkedMembershipRole} = await import('../src/modules/auth/clerk-provider');
      const originalIssuer = process.env.CLERK_ISSUER;
      try {
        process.env.CLERK_ISSUER = 'https://wrong-instance.clerk.accounts.dev';
        await expect(legacyClerkMemberships(user)).rejects.toThrow('not configured');
        await expect(linkedMembershipRole(user, org)).rejects.toThrow('not configured');
        delete process.env.CLERK_ISSUER;
        await expect(linkedMembershipRole(user, org)).rejects.toThrow('not configured');
      } finally {
        if (originalIssuer === undefined) delete process.env.CLERK_ISSUER;
        else process.env.CLERK_ISSUER = originalIssuer;
      }
      const lock = await pools.authentication.connect();
      try {
        await lock.query("BEGIN");
        const projected = await lock.query(
          `SELECT u.id FROM webdock_auth.clerk_identity i JOIN webdock_auth."user" u ON u.id=i.user_id WHERE i.issuer=$1 AND i.clerk_user_id=$2 AND i.enabled AND NOT coalesce(u.banned,false) AND u.role='user' FOR SHARE OF u`,
          [issuer, "user_" + user],
        );
        expect(projected.rows[0].id).toBe(user);
        expect(
          (
            await owner.query(
              'SELECT count(*)::int AS n FROM webdock_auth.member WHERE "userId"=$1',
              [user],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await lock.query("ROLLBACK");
        lock.release();
      }
      const projectionArgs=[issuer,"user_invited_"+user,"org_"+org,"Invited fixture","invited-"+user+"@example.invalid"];
      const projected=(await pools.authentication.query('SELECT webdock_rls.project_clerk_user($1,$2,$3,$4,$5) AS id',projectionArgs)).rows[0].id;
      expect((await pools.authentication.query('SELECT webdock_rls.project_clerk_user($1,$2,$3,$4,$5) AS id',projectionArgs)).rows[0].id).toBe(projected);
      expect((await owner.query('SELECT count(*)::int AS n FROM webdock_auth.account WHERE "userId"=$1',[projected])).rows[0].n).toBe(0);
      await expect(pools.authentication.query('SELECT webdock_rls.project_clerk_user($1,$2,$3,$4,$5)',[issuer,"user_conflict_"+user,"org_"+org,"Collision",user+"@example.invalid"])).rejects.toMatchObject({code:"23505"});
      const {createAuthentication}=await import('../src/modules/auth/auth');
      const legacyAuth=createAuthentication({database:pools.authentication,baseURL:'http://localhost:3125',secret:process.env.BETTER_AUTH_SECRET!});
      const context=await legacyAuth.$context;
      await expect(context.internalAdapter.createAccount({userId:projected,providerId:'credential',accountId:projected,password:'not-a-real-hash'})).rejects.toThrow('Use your Console account');
      await expect(context.internalAdapter.createSession(projected)).rejects.toThrow('Use your Console account');
      expect((await owner.query('SELECT legacy_eligible FROM webdock_auth.clerk_identity WHERE user_id=$1',[projected])).rows[0].legacy_eligible).toBe(false);
      const scope = {
        kind: "session" as const,
        subject: user,
        sessionID: "sess_" + user,
        clerk: {
          issuer,
          userID: "user_" + user,
          organizationID: org,
          clerkOrganizationID: "org_" + org,
          customerID: customer,
          role: "admin" as const,
          verifiedAt: Date.now(),
          expiresAt: Date.now() + 59000,
        },
      };
      const allowed = () =>
        pools.business.query(
          "SELECT webdock_rls.customer_allowed($1,true) AS own,webdock_rls.customer_allowed($2) AS other,webdock_rls.operator() AS operator",
          [customer, other],
        );
      expect((await withDatabaseScope(scope, allowed)).rows[0]).toEqual({
        own: true,
        other: false,
        operator: false,
      });
      expect(
        (
          await withDatabaseScope(
            { ...scope, clerk: { ...scope.clerk, expiresAt: 1 } },
            allowed,
          )
        ).rows[0].own,
      ).toBe(false);
      expect(
        (
          await withDatabaseScope(
            {
              ...scope,
              clerk: { ...scope.clerk, issuer: "https://wrong.test" },
            },
            allowed,
          )
        ).rows[0].own,
      ).toBe(false);
      expect(
        (await withDatabaseScope({ ...scope, clerk: undefined }, allowed))
          .rows[0].own,
      ).toBe(false);
      const legacyID = "legacy_" + user;
      await owner.query(
        `INSERT INTO webdock_auth.session(id,token,"userId","expiresAt","updatedAt") VALUES($1,$1,$2,now()+interval '1 hour',now())`,
        [legacyID, user],
      );
      await owner.query(
        `INSERT INTO webdock_auth.member("userId","organizationId",role,"createdAt") VALUES($1,$2,'admin',now())`,
        [user, org],
      );
      const legacy = {
        kind: "session" as const,
        subject: user,
        sessionID: legacyID,
      };
      const memberships = {
        issuer,
        userID: "user_" + user,
        verifiedAt: Date.now(),
        expiresAt: Date.now() + 59000,
        roles: [{ organizationID: org, customerID: customer, role: "admin" }],
      };
      expect((await withDatabaseScope(legacy, allowed)).rows[0].own).toBe(
        false,
      );
      expect(
        (await withDatabaseScope({ ...legacy, memberships }, allowed)).rows[0]
          .own,
      ).toBe(true);
      expect(
        (
          await withDatabaseScope(
            {
              ...legacy,
              memberships: {
                ...memberships,
                roles: [
                  { organizationID: org, customerID: customer, role: "member" },
                ],
              },
            },
            allowed,
          )
        ).rows[0].own,
      ).toBe(false);
      expect(
        (
          await withDatabaseScope(
            { ...legacy, memberships: { ...memberships, roles: [] } },
            allowed,
          )
        ).rows[0].own,
      ).toBe(false);
      await owner.query("DELETE FROM webdock_auth.session WHERE id=$1", [
        legacyID,
      ]);
      await owner.query('DELETE FROM webdock_auth.member WHERE "userId"=$1', [
        user,
      ]);
      await owner.query(
        'UPDATE webdock_auth."user" SET "emailVerified"=false,"mustChangePassword"=true WHERE id=$1',
        [user],
      );
      const { getTenant } = await import("../src/modules/access/tenants");
      const view = await withConsolePrincipal(
        {
          provider: "clerk",
          issuer,
          userID: user,
          clerkUserID: "user_" + user,
          sessionID: scope.sessionID,
          operator: false,
          organizationID: org,
          clerkOrganizationID: "org_" + org,
          customerID: customer,
          role: "admin",
          verifiedAt: scope.clerk.verifiedAt,
          expiresAt: scope.clerk.expiresAt,
          name: "Fixture",
          email: user + "@example.invalid",
        },
        () => getTenant(new Headers(), customer),
      );
      expect(view.tenant.id).toBe(customer);
      await owner.query(
        "UPDATE webdock_auth.clerk_identity SET enabled=false WHERE user_id=$1",
        [user],
      );
      expect((await withDatabaseScope(scope, allowed)).rows[0].own).toBe(false);
      await owner.query(
        "UPDATE webdock_auth.clerk_identity SET enabled=true WHERE user_id=$1",
        [user],
      );
      await owner.query(
        `UPDATE webdock_auth."user" SET role='operator' WHERE id=$1`,
        [user],
      );
      expect((await withDatabaseScope(scope, allowed)).rows[0].operator).toBe(
        true,
      );
      await owner.query("INSERT INTO webdock_auth.tenant_storage(id,customer_id,label,environment,store_id,prefix,encrypted_token) VALUES($1,$2,'Clerk fixture','production',$3,'','fixture-only')",[storageID,customer,"store-"+user]);
      const {manageTenantStorage}=await import('../src/modules/platform/storage-usage');
      await withConsolePrincipal({provider:'clerk',issuer,userID:user,clerkUserID:'user_'+user,sessionID:scope.sessionID,operator:true,organizationID:null,clerkOrganizationID:null,customerID:null,role:null,verifiedAt:Date.now(),expiresAt:Date.now()+59000,name:'Operator fixture',email:user+'@example.invalid'},()=>manageTenantStorage(new Headers(),customer,{action:'remove',storageID}));
      expect((await owner.query('SELECT count(*)::int AS n FROM webdock_auth.tenant_storage WHERE id=$1',[storageID])).rows[0].n).toBe(0);
      await owner.query(
        "INSERT INTO webdock_auth.console_tenant_preview(issuer,session_id,actor_id,customer_id,organization_id,expires_at) VALUES($1,$2,$3,$4,$5,now()-interval '1 minute')",
        [issuer, scope.sessionID, user, customer, org],
      );
      expect((await withDatabaseScope(scope, allowed)).rows[0]).toEqual({
        own: false,
        other: false,
        operator: false,
      });
      expect(
        (
          await owner.query(
            'SELECT count(*)::int AS n FROM webdock_auth.session WHERE "userId"=$1',
            [user],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await owner.query("DELETE FROM webdock_auth.tenant_storage WHERE id=$1 AND label='Clerk fixture' AND encrypted_token='fixture-only'",[storageID]);
      await pools.close();
      await owner.end();
    }
  },
);
