import { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
export async function billingFixture(
  environment: "sandbox" | "live" = "sandbox",
) {
  const url = new URL(process.env.API_TEST_OWNER_URL!);
  if (
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/webdock_rls_test" ||
    url.search ||
    url.hash
  )
    throw Error("Isolated RLS fixture required");
  const owner = new Pool({ connectionString: url.href, max: 1 }),
    base = BigInt(
      "88" + BigInt("0x" + randomBytes(4).toString("hex")).toString(),
    ),
    id = (n: number) => (base + BigInt(n)).toString();
  const user = id(1),
    session = id(2),
    other = id(3),
    otherSession = id(4),
    reader = id(5),
    readerSession = id(6),
    customer = id(7),
    otherCustomer = id(8),
    project = id(9),
    binding = id(10),
    client = id(11),
    instance = id(12),
    product = id(13),
    version = id(14);
  const organization = randomUUID(),
    polarProduct = randomUUID(),
    price = randomUUID();
  const extraProducts: string[] = [];
  const previousOrigin = process.env.WEBDOCK_STUDIO_ORIGIN;
  process.env.WEBDOCK_STUDIO_ORIGIN = "https://studio.webdock.dev";
  for (const [subject, sid] of [
    [user, session],
    [other, otherSession],
    [reader, readerSession],
  ]) {
    await owner.query(
      `INSERT INTO webdock_auth."user"(id,name,email,role,"emailVerified","mustChangePassword","twoFactorEnabled") VALUES($1,'Purchase fixture',$2,'user',true,false,false)`,
      [subject, subject + "@example.invalid"],
    );
    await owner.query(
      `INSERT INTO webdock_auth.session(id,token,"userId","expiresAt","updatedAt") VALUES($1,$1,$2,now()+interval '1 hour',now())`,
      [sid, subject],
    );
  }
  await owner.query(
    "INSERT INTO webdock_admin.customers(id,name,status) VALUES($1,'Buyer','active'),($2,'Other buyer','active')",
    [customer, otherCustomer],
  );
  for (const [subject, c, role] of [
    [user, customer, "admin"],
    [other, otherCustomer, "admin"],
    [reader, customer, "member"],
  ])
    await owner.query(
      'INSERT INTO webdock_auth.member("userId","organizationId",role,"createdAt") SELECT $1,organization_id,$3,now() FROM webdock_auth.tenant_customer WHERE customer_id=$2',
      [subject, c, role],
    );
  await owner.query(
    "INSERT INTO webdock_admin.projects(id,name,customer_id,url,status) VALUES($1,'Purchase website',$2,'https://purchase-fixture.webdock.dev','active')",
    [project, customer],
  );
  await owner.query(
    'INSERT INTO webdock_auth."oauthClient"(id,"clientId","redirectUris") VALUES($1,$1,$2)',
    [
      client,
      JSON.stringify(["https://purchase-fixture.webdock.dev/api/sso/callback"]),
    ],
  );
  await owner.query(
    "INSERT INTO webdock_auth.app_binding(id,client_id,label,organization_id) SELECT $1,$2,'Purchase website',organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$3",
    [binding, client, customer],
  );
  await owner.query(
    "INSERT INTO webdock_admin.cms_instances(id,label,project_id,admin_u_r_l,schema_name,provider_project_i_d,provider,template,status) VALUES($1,'Purchase CMS',$2,$3,$4,$5,'vercel','custom','active')",
    [
      instance,
      project,
      "https://studio.webdock.dev/sites/" + binding,
      "purchase" + base,
      "prj_purchase" + base,
    ],
  );
  if (
    (
      await owner.query(
        "SELECT 1 FROM webdock_auth.billing_connection WHERE environment=$1",
        [environment],
      )
    ).rowCount
  )
    throw Error("Use an empty billing fixture");
  await owner.query(
    "INSERT INTO webdock_auth.billing_connection(environment,organization_id,sales_enabled,endpoint_id,locked,updated_by) VALUES($4,$1,true,$2,true,$3)",
    [organization, randomUUID(), user, environment],
  );
  await owner.query(
    "INSERT INTO webdock_auth.billing_customer(environment,customer_id,is_test) VALUES($3,$1,$4),($3,$2,$4)",
    [customer, otherCustomer, environment, environment === "sandbox"],
  );
  await owner.query(
    "INSERT INTO webdock_auth.billing_product(id,sku,name,family,visibility,operationally_ready) VALUES($1,$2,'Purchase Website','website','public',true)",
    [product, "purchase-" + base],
  );
  await owner.query(
    "INSERT INTO webdock_auth.billing_product_version(id,product_id,version,amount,currency,tax_behavior,interval,description,terms_text,entitlements,terms_hash,frozen) VALUES($1,$2,1,5880,'EUR','inclusive','year','Purchase fixture','Fixture annual terms',$3,$4,true)",
    [
      version,
      product,
      JSON.stringify({
        websites: 1,
        editors: 1,
        mediaBytes: "500000000",
        mailMonthly: 100,
      }),
      "a".repeat(64),
    ],
  );
  await owner.query(
    "INSERT INTO webdock_auth.billing_product_mapping(environment,version_id,polar_product_id,price_ids,status) VALUES($4,$1,$2,$3,'ready')",
    [version, polarProduct, JSON.stringify([price]), environment],
  );
  const cleanup = async () => {
    if (previousOrigin === undefined) delete process.env.WEBDOCK_STUDIO_ORIGIN;
    else process.env.WEBDOCK_STUDIO_ORIGIN = previousOrigin;
    const tx = await owner.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("SET LOCAL session_replication_role='replica'");
      for (const table of [
        "billing_job",
        "billing_order",
        "billing_manual_release",
        "billing_change",
        "billing_subscription",
        "billing_checkout",
        "billing_offer",
        "billing_contract",
        "billing_customer",
        "tenant_subscription",
        "subscription_history",
      ])
        await tx.query(
          `DELETE FROM webdock_auth.${table} WHERE customer_id=ANY($1)`,
          [[customer, otherCustomer]],
        );
      await tx.query(
        "DELETE FROM webdock_auth.billing_connection WHERE updated_by=$1",
        [user],
      );
      await tx.query(
        "DELETE FROM webdock_auth.billing_product_mapping WHERE version_id IN (SELECT id FROM webdock_auth.billing_product_version WHERE product_id=ANY($1))",
        [[product, ...extraProducts]],
      );
      await tx.query(
        "DELETE FROM webdock_auth.billing_product_version WHERE product_id=ANY($1)",
        [[product, ...extraProducts]],
      );
      await tx.query(
        "DELETE FROM webdock_auth.billing_product WHERE id=ANY($1)",
        [[product, ...extraProducts]],
      );
      await tx.query(
        "DELETE FROM webdock_admin.project_deletion WHERE project_id=$1",
        [project],
      );
      await tx.query("DELETE FROM webdock_admin.cms_instances WHERE id=$1", [
        instance,
      ]);
      await tx.query("DELETE FROM webdock_admin.projects WHERE id=$1", [
        project,
      ]);
      await tx.query("DELETE FROM webdock_auth.app_binding WHERE id=$1", [
        binding,
      ]);
      await tx.query('DELETE FROM webdock_auth."oauthClient" WHERE id=$1', [
        client,
      ]);
      await tx.query(
        "DELETE FROM webdock_auth.access_event WHERE actor_id=ANY($1)",
        [[user, other, reader]],
      );
      await tx.query('DELETE FROM webdock_auth.member WHERE "userId"=ANY($1)', [
        [user, other, reader],
      ]);
      const orgs = (
        await tx.query(
          "DELETE FROM webdock_auth.tenant_customer WHERE customer_id=ANY($1) RETURNING organization_id",
          [[customer, otherCustomer]],
        )
      ).rows.map((row) => row.organization_id);
      await tx.query("DELETE FROM webdock_auth.organization WHERE id=ANY($1)", [
        orgs,
      ]);
      await tx.query("DELETE FROM webdock_admin.customers WHERE id=ANY($1)", [
        [customer, otherCustomer],
      ]);
      await tx.query("DELETE FROM webdock_auth.session WHERE id=ANY($1)", [
        [session, otherSession, readerSession],
      ]);
      await tx.query('DELETE FROM webdock_auth."user" WHERE id=ANY($1)', [
        [user, other, reader],
      ]);
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
      await owner.end();
    }
  };
  return {
    environment,
    extraProducts,
    owner,
    actor: { subject: user, sessionID: session },
    otherActor: { subject: other, sessionID: otherSession },
    readerActor: { subject: reader, sessionID: readerSession },
    customer,
    otherCustomer,
    project,
    binding,
    client,
    instance,
    product,
    version,
    organization,
    polarProduct,
    price,
    cleanup,
  };
}
