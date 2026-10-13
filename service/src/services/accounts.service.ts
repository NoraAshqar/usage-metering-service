import { pool } from '../db';
import { generateApiKey, hashApiKey } from '../utils/apiKey';
import { PlanRow, getPlan, resolveAssignablePlan, toPlanResponse } from './plans.service';

interface AccountRow {
  id: number;
  name: string;
  plan_id: number;
  created_at: Date;
}

function toAccountResponse(account: AccountRow, plan: PlanRow) {
  return {
    id: account.id,
    name: account.name,
    plan: toPlanResponse(plan),
    createdAt: account.created_at,
  };
}

// Creates an account and returns its API key. This is the only time the raw key is visible.
export async function createAccount(name: string, planId?: number) {
  const plan = await resolveAssignablePlan(null, 'account', planId);
  const apiKey = generateApiKey();

  const result = await pool.query<AccountRow>(
    'INSERT INTO accounts (name, api_key_hash, plan_id) VALUES ($1, $2, $3) RETURNING id, name, plan_id, created_at',
    [name, hashApiKey(apiKey), plan.id],
  );

  return { account: toAccountResponse(result.rows[0], plan), apiKey };
}

export async function getAccount(accountId: number) {
  const result = await pool.query<AccountRow>(
    'SELECT id, name, plan_id, created_at FROM accounts WHERE id = $1',
    [accountId],
  );
  const account = result.rows[0];
  return toAccountResponse(account, await getPlan(account.plan_id));
}

// Switching plans does not touch usage: units already used this month still count.
export async function changeAccountPlan(accountId: number, planId: number) {
  const plan = await resolveAssignablePlan(accountId, 'account', planId);
  await pool.query('UPDATE accounts SET plan_id = $1 WHERE id = $2', [plan.id, accountId]);
  return getAccount(accountId);
}
