import {outboxSchemaSQL,outboxGrants} from '@webdock/mail-core/outbox';
import {mailSendSchemaSQL,mailSendGrants} from '../src/lib/mail-send-schema';
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { mailboxSchemaSQL, mailboxGrants } from "../src/lib/mailbox-schema";
import { mailBudgetSchemaSQL, mailBudgetGrants } from "../src/lib/mail-budget";
import { nativeMailSchemaSQL, nativeMailClusterSchemaSQL, nativeMailGrants } from "@webdock/mail-core/schema";

// Explicit offline migration after migrate.ts and migrate-tenants.ts.
const file = process.argv[2];
if (!file) throw new Error("Usage: migrate-mail-native.ts owner.env (optional AUTH_DB_ROLE; MAIL_WORKER_DB_ROLE only for local Docker workers)");
const env = parseEnv(readFileSync(file, "utf8"));
const grants = nativeMailGrants(env.AUTH_DB_ROLE || "webdock_auth_runtime", env.MAIL_WORKER_DB_ROLE);
const database = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED || env.DATABASE_URL, max: 1 });
try {
  await database.query("BEGIN");
  await database.query("SET LOCAL lock_timeout='5s'");
  await database.query("SET LOCAL statement_timeout='60s'");
  await database.query(nativeMailSchemaSQL);
  await database.query(nativeMailClusterSchemaSQL);
  await database.query(grants);
  await database.query(mailboxSchemaSQL);
  await database.query(mailboxGrants(env.AUTH_DB_ROLE || "webdock_auth_runtime"));
  await database.query(mailBudgetSchemaSQL);
  await database.query(mailBudgetGrants(env.AUTH_DB_ROLE || "webdock_auth_runtime"));
  await database.query(outboxSchemaSQL);
  await database.query(outboxGrants(env.AUTH_DB_ROLE || "webdock_auth_runtime"));
  await database.query(mailSendSchemaSQL);
  await database.query(mailSendGrants(env.AUTH_DB_ROLE || "webdock_auth_runtime"));
  await database.query("COMMIT");
  console.log("Native Mail activation registry, operation queue and scoped runtime grants ready.");
} catch (error) {
  await database.query("ROLLBACK");
  throw error;
} finally { await database.end(); }
