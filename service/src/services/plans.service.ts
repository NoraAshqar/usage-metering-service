import { isUniqueViolation, pool } from '../db';
import { HttpError } from '../errors';

export const PLAN_SCOPES = ['account', 'user'] as const;
export type PlanScope = (typeof PLAN_SCOPES)[number];

export interface PlanRow {
  id: number;
  account_id: number | null; // null = predefined plan
  name: string;
  scope: PlanScope;
  monthly_limit: number;
  max_units_per_request: number;
}

// The plan shape we return in the API (camelCase, no internal columns).
export function toPlanResponse(plan: PlanRow) {
  return {
    id: plan.id,
    name: plan.name,
    scope: plan.scope,
    monthlyLimit: plan.monthly_limit,
    maxUnitsPerRequest: plan.max_units_per_request,
    predefined: plan.account_id === null,
  };
}

// Used when no planId is given while creating an account or a user.
const DEFAULT_PLAN_NAME: Record<PlanScope, string> = { account: 'Starter', user: 'Basic' };

export async function getPlan(planId: number): Promise<PlanRow> {
  const result = await pool.query<PlanRow>('SELECT * FROM plans WHERE id = $1', [planId]);
  return result.rows[0];
}

// Returns the plan only if it may be assigned at this level:
//   - the scope matches ('account' plans for accounts, 'user' plans for users), and
//   - it is predefined OR it belongs to this account.
// accountId is null while an account is being created, so only predefined plans match.
// Another account's plan gives the same error as a missing plan, so nothing leaks between accounts.
export async function resolveAssignablePlan(
  accountId: number | null,
  scope: PlanScope,
  planId?: number,
): Promise<PlanRow> {
  const result =
    planId === undefined
      ? await pool.query<PlanRow>(
          'SELECT * FROM plans WHERE account_id IS NULL AND scope = $1 AND name = $2',
          [scope, DEFAULT_PLAN_NAME[scope]],
        )
      : await pool.query<PlanRow>(
          'SELECT * FROM plans WHERE id = $1 AND scope = $2 AND (account_id IS NULL OR account_id = $3)',
          [planId, scope, accountId],
        );

  if (result.rowCount === 0) {
    throw new HttpError(400, 'invalid_plan', `Plan ${planId} does not exist or is not a ${scope} plan you can use`);
  }
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Plans API: an account sees the predefined plans and its own custom plans.
// ---------------------------------------------------------------------------

export async function listPlans(accountId: number) {
  const result = await pool.query<PlanRow>(
    'SELECT * FROM plans WHERE account_id IS NULL OR account_id = $1 ORDER BY account_id NULLS FIRST, id',
    [accountId],
  );
  return result.rows.map(toPlanResponse);
}

// Another account's plan is "not found", like a plan that does not exist.
async function findVisiblePlan(accountId: number, planId: number): Promise<PlanRow> {
  const result = await pool.query<PlanRow>(
    'SELECT * FROM plans WHERE id = $1 AND (account_id IS NULL OR account_id = $2)',
    [planId, accountId],
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, 'plan_not_found', `Plan ${planId} not found`);
  }
  return result.rows[0];
}

export async function getVisiblePlan(accountId: number, planId: number) {
  return toPlanResponse(await findVisiblePlan(accountId, planId));
}

function planNameTaken(name: string): HttpError {
  return new HttpError(409, 'plan_name_taken', `You already have a plan named "${name}" with this scope`);
}

export interface NewPlan {
  name: string;
  scope: PlanScope;
  monthlyLimit: number;
  maxUnitsPerRequest: number;
}

export async function createPlan(accountId: number, plan: NewPlan) {
  try {
    const result = await pool.query<PlanRow>(
      `INSERT INTO plans (account_id, name, scope, monthly_limit, max_units_per_request)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [accountId, plan.name, plan.scope, plan.monthlyLimit, plan.maxUnitsPerRequest],
    );
    return toPlanResponse(result.rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) throw planNameTaken(plan.name);
    throw err;
  }
}

export interface PlanChanges {
  name?: string;
  monthlyLimit?: number;
  maxUnitsPerRequest?: number;
}

// Updates a custom plan in place. Every account/user assigned to it gets the new limits
// on their NEXT consume request (consume always reads the current plan).
// Usage and request history are not touched. The scope can't change, so assignments stay valid.
export async function updatePlan(accountId: number, planId: number, changes: PlanChanges) {
  const plan = await findVisiblePlan(accountId, planId);
  if (plan.account_id === null) {
    throw new HttpError(403, 'plan_read_only', 'Predefined plans cannot be changed. Create a custom plan instead.');
  }

  try {
    // COALESCE(new, old): a field that was not sent (null) keeps its current value.
    const result = await pool.query<PlanRow>(
      `UPDATE plans SET
         name                  = COALESCE($1, name),
         monthly_limit         = COALESCE($2, monthly_limit),
         max_units_per_request = COALESCE($3, max_units_per_request),
         updated_at            = now()
       WHERE id = $4
       RETURNING *`,
      [changes.name ?? null, changes.monthlyLimit ?? null, changes.maxUnitsPerRequest ?? null, planId],
    );
    return toPlanResponse(result.rows[0]);
  } catch (err) {
    if (isUniqueViolation(err) && changes.name) throw planNameTaken(changes.name);
    throw err;
  }
}
