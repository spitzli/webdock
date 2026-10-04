import { database } from "../src/lib/db";
import { platformSchemaSQL } from "../src/lib/platform";
try { await database.query(platformSchemaSQL); console.log("Platform settings and encrypted Mail credentials ready."); }
finally { await database.end(); }
