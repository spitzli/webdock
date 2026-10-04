import { auth } from "../src/lib/auth";
import { database } from "../src/lib/db";
import { accessSchemaSQL } from "../src/lib/access-management";
try {
  await auth.$context;
  await database.query(accessSchemaSQL);
  console.log("Access management audit table ready.");
} finally {
  await database.end();
}
