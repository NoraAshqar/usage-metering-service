import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { pool } from '../src/db';
import { runMigrations } from '../src/migrate';

// Tests run against the Postgres started by docker compose (localhost:5432).
// Every test creates its own accounts, so tests never see each other's data.

export const app = createApp();

export async function setupDatabase() {
  await runMigrations();
}

export async function closeDatabase() {
  await pool.end();
}

// Creates a fresh account through the API and returns its API key.
export async function createTestAccount(planId?: number): Promise<{ apiKey: string; accountId: number }> {
  const res = await request(app)
    .post('/admin/accounts')
    .set('x-admin-key', config.adminKey)
    .send({ name: 'test account', planId });
  return { apiKey: res.body.apiKey, accountId: res.body.account.id };
}

export async function predefinedPlanId(name: string): Promise<number> {
  const result = await pool.query('SELECT id FROM plans WHERE account_id IS NULL AND name = $1', [name]);
  return result.rows[0].id;
}
