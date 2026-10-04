import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
import { platformSchemaSQL } from "../src/lib/platform";
import { mailSchemaSQL } from "../src/lib/tenant-mail";
import { senderDomainSchemaSQL } from "../src/lib/mail-domains";
import { trackingSchemaSQL } from "../src/lib/mail-tracking";
try {
  await auth.$context;
  await database.query(platformSchemaSQL);
  await database.query(mailSchemaSQL);
  await database.query(senderDomainSchemaSQL);
  await database.query(trackingSchemaSQL);
  console.log("Tenant Mail accounts, sender domains and tracking records ready.");
} finally { await database.end(); }
