import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Pool } from 'pg';
import { tenantPreviewSchemaSQL } from '../src/lib/tenant-preview-schema';

const ownerFile = process.argv[2];
if (!ownerFile) throw Error('Usage: migrate-tenant-preview.ts owner.env');
const env = parseEnv(readFileSync(ownerFile, 'utf8'));
const pool = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED || env.DATABASE_URL, max: 1 });
const connection = await pool.connect();
try {
 await connection.query('BEGIN');
 await connection.query(tenantPreviewSchemaSQL);
 await connection.query('GRANT SELECT,INSERT,UPDATE,DELETE ON webdock_auth.studio_tenant_preview TO webdock_auth_runtime');
 await connection.query('COMMIT');
 console.log('Session-bound tenant preview schema ready.');
} catch (error) { await connection.query('ROLLBACK'); throw error; }
finally { connection.release(); await pool.end(); }
