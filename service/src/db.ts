import { Pool, PoolClient } from 'pg';
import { config } from './config';

// One shared pool of connections for the whole service.
export const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });

// True when a query failed because of a UNIQUE constraint/index (Postgres error code 23505).
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '23505';
}

// Runs `fn` inside BEGIN ... COMMIT. If `fn` throws, the transaction is rolled back.
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
