import type { PoolClient } from 'pg';
import { database } from '../db';
export async function withMailTransaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await database.connect();
  try {
    await db.query('BEGIN');
    const result = await run(db);
    await db.query('COMMIT');
    return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
