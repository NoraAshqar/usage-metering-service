import { pool } from '../db';
import { HttpError } from '../errors';

export type PlanScope = 'account' | 'user';

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
