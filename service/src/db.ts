import { Pool, PoolClient, types } from 'pg';
import { config } from './config';

// Keep DATE values as 'YYYY-MM-DD' strings; the default parser converts them using the local timezone.
const DATE_TYPE_OID = 1082;
types.setTypeParser(DATE_TYPE_OID, (value) => value);

export const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '23505';
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
