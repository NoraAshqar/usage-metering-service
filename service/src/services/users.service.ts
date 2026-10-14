import { pool } from '../db';
import { HttpError } from '../errors';
import { PlanRow, getPlan, resolveAssignablePlan, toPlanResponse } from './plans.service';

export interface UserRow {
  id: number;
  account_id: number;
  external_id: string;
  plan_id: number;
  created_at: Date;
}

function toUserResponse(user: UserRow, plan: PlanRow) {
  return {
    userId: user.external_id,
    plan: toPlanResponse(plan),
    createdAt: user.created_at,
  };
}

export async function findUser(accountId: number, userId: string): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE account_id = $1 AND external_id = $2',
    [accountId, userId],
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'user_not_found', `User ${userId} not found`);
  }
  return result.rows[0];
}

export async function createUser(accountId: number, userId: string, planId?: number) {
  const plan = await resolveAssignablePlan(accountId, 'user', planId);

  const result = await pool.query<UserRow>(
    `INSERT INTO users (account_id, external_id, plan_id) VALUES ($1, $2, $3)
     ON CONFLICT (account_id, external_id) DO NOTHING
     RETURNING *`,
    [accountId, userId, plan.id],
  );
  if (result.rowCount === 0) {
    throw new HttpError(409, 'user_exists', `User ${userId} already exists`);
  }
  return toUserResponse(result.rows[0], plan);
}

export async function getUser(accountId: number, userId: string) {
  const user = await findUser(accountId, userId);
  return toUserResponse(user, await getPlan(user.plan_id));
}

export async function changeUserPlan(accountId: number, userId: string, planId: number) {
  const user = await findUser(accountId, userId);
  const plan = await resolveAssignablePlan(accountId, 'user', planId);
  await pool.query('UPDATE users SET plan_id = $1 WHERE id = $2', [plan.id, user.id]);
  return toUserResponse({ ...user, plan_id: plan.id }, plan);
}
