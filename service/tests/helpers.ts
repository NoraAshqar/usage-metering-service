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

// Creates a custom plan and returns its id.
export async function createPlan(
  apiKey: string,
  scope: 'account' | 'user',
  monthlyLimit: number,
  maxUnitsPerRequest: number,
): Promise<number> {
  const res = await request(app)
    .post('/plans')
    .set('x-api-key', apiKey)
    .send({ name: `plan-${Math.random()}`, scope, monthlyLimit, maxUnitsPerRequest });
  return res.body.id;
}

// An account on its own account plan, with one user per given user plan id.
export async function setupAccount(
  accountPlan: { monthlyLimit: number; maxUnitsPerRequest: number },
  users: Record<string, { monthlyLimit: number; maxUnitsPerRequest: number }>,
) {
  const { apiKey, accountId } = await createTestAccount();
  const accountPlanId = await createPlan(apiKey, 'account', accountPlan.monthlyLimit, accountPlan.maxUnitsPerRequest);
  await request(app).put('/account/plan').set('x-api-key', apiKey).send({ planId: accountPlanId });

  const userPlanIds: Record<string, number> = {};
  for (const [userId, plan] of Object.entries(users)) {
    userPlanIds[userId] = await createPlan(apiKey, 'user', plan.monthlyLimit, plan.maxUnitsPerRequest);
    await request(app).post('/users').set('x-api-key', apiKey).send({ userId, planId: userPlanIds[userId] });
  }
  return { apiKey, accountId, accountPlanId, userPlanIds };
}

let requestCounter = 0;
export function newRequestId(): string {
  requestCounter += 1;
  return `req-${Date.now()}-${requestCounter}`;
}

export function consumeUnits(apiKey: string, userId: string, units: number, requestId = newRequestId()) {
  return request(app).post('/consume').set('x-api-key', apiKey).send({ userId, units, requestId });
}
