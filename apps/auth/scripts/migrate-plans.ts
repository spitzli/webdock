import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
import { plansSchemaSQL } from "../src/lib/plans";
import { storageUsageSchemaSQL } from "../src/lib/storage-usage";

try {
  await auth.$context;
  await database.query(plansSchemaSQL);
  await database.query(storageUsageSchemaSQL);
  console.log("Plan templates, tenant assignments, offers and storage measurements ready.");
} finally { await database.end(); }
