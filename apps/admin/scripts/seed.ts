import { getPayload } from "payload";
import config from "../src/payload.config";
import { closeSnowflakePool } from "../src/lib/snowflake";
const p = await getPayload({ config });
try {
  const email = process.env.OPERATOR_EMAIL || "dominik@spitzli.dev";
  let operator = (
    await p.find({
      collection: "users",
      where: { email: { equals: email } },
      overrideAccess: true,
      limit: 1,
    })
  ).docs[0];
  if (!operator) {
    if (
      !process.env.OPERATOR_AUTH_SUBJECT &&
      !process.env.LOCAL_OPERATOR_PASSWORD
    )
      throw Error("Provide an approved SSO subject or a local test password");
    operator = await p.create({
      collection: "users",
      data: {
        name: "Dominik",
        email,
        role: "operator",
        ...(process.env.OPERATOR_AUTH_SUBJECT
          ? { authSubject: process.env.OPERATOR_AUTH_SUBJECT }
          : { password: process.env.LOCAL_OPERATOR_PASSWORD }),
      },
      overrideAccess: true,
      context: { bootstrap: true },
    });
  }
  if (
    process.env.OPERATOR_AUTH_SUBJECT &&
    operator.authSubject !== process.env.OPERATOR_AUTH_SUBJECT
  ) {
    if (operator.authSubject) throw Error("Existing subject mapping differs");
    await p.db.pool.query(
      "UPDATE webdock_admin.users SET auth_subject=$1 WHERE id=$2",
      [process.env.OPERATOR_AUTH_SUBJECT, operator.id],
    );
    operator.authSubject = process.env.OPERATOR_AUTH_SUBJECT;
  }
  const user = { ...operator, collection: "users" as const };
  const customer = async (name: string) => {
    const found = (
      await p.find({
        collection: "customers",
        where: { name: { equals: name } },
        overrideAccess: false,
        user,
        limit: 1,
      })
    ).docs[0];
    return (
      found ||
      p.create({
        collection: "customers",
        data: { name, status: "active" },
        overrideAccess: false,
        user,
      })
    );
  };
  const spitzli = await customer("Spitzli Development");
  const stall = await customer("Stall Eichenbruch");
  const entries = [
    {
      name: "Webdock",
      customer: spitzli.id,
      url: "https://webdock.dev",
      repositoryURL: "https://github.com/spitzli/webdock",
      adminURL: "https://webdock.dev/admin",
      schemaName: "webdock",
      providerProjectID: "prj_TqeFXSoCLV7dNDQ2VHdRiYnR4K7L",
      template: "webdock-landing" as const,
    },
    {
      name: "Spitzli Development",
      customer: spitzli.id,
      url: "https://spitzli.dev",
      repositoryURL: "https://github.com/spitzli/spitzli",
      adminURL: "https://spitzli.vercel.app/admin",
      schemaName: "spitzli",
      providerProjectID: "prj_V5kkIarQ82smsG8oNaXHN1gwKrgc",
      template: "spitzli-portfolio" as const,
    },
    {
      name: "Stall Eichenbruch",
      customer: stall.id,
      url: "https://www.stall-eichenbruch.de",
      repositoryURL: "https://github.com/spitzli/stall-eichenbruch",
      adminURL: "https://www.stall-eichenbruch.de/admin",
      schemaName: "stall",
      providerProjectID: "prj_I6CM5NhcNs922GUDx1aU67TlEsCq",
      template: "stall-business" as const,
    },
  ];
  for (const e of entries) {
    const existing = await p.count({
      collection: "cms-instances",
      where: { providerProjectID: { equals: e.providerProjectID } },
      overrideAccess: false,
      user,
    });
    if (existing.totalDocs) continue;
    let project = (
      await p.find({
        collection: "projects",
        where: {
          and: [
            { customer: { equals: e.customer } },
            { name: { equals: e.name } },
          ],
        },
        limit: 1,
        overrideAccess: false,
        user,
      })
    ).docs[0];
    project ??= await p.create({
      collection: "projects",
      data: {
        name: e.name,
        customer: e.customer,
        url: e.url,
        repositoryURL: e.repositoryURL,
        status: "active",
      },
      overrideAccess: false,
      user,
    });
    await p.create({
      collection: "cms-instances",
      data: {
        label: e.name,
        project: project.id,
        adminURL: e.adminURL,
        schemaName: e.schemaName,
        providerProjectID: e.providerProjectID,
        template: e.template,
        payloadVersion: "4.0.0-canary.37",
        status: "active",
        provider: "vercel",
      },
      overrideAccess: false,
      user,
    });
  }
  // The account password is never printed or stored by this script.
  console.log(
    "Operator and three existing CMS connections are present. No infrastructure was provisioned by seeding.",
  );
} finally {
  await p.destroy();
  await closeSnowflakePool();
}
