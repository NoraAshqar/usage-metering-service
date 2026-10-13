// Pure rule evaluation - NO database here, so it is easy to read and to unit-test.

export type Level = 'account' | 'user';
export type Rule = 'max_units_per_request' | 'monthly_limit';

// The limits of one plan plus what was already used this month at that level.
export interface LevelState {
  monthlyLimit: number;
  maxUnitsPerRequest: number;
  used: number;
}

export type Decision =
  | { accepted: true }
  | { accepted: false; level: Level; rule: Rule };

// Units still available this month. Never negative: if a plan was reduced below
// what is already used, the remaining allowance is simply 0.
export function remaining(monthlyLimit: number, used: number): number {
  return Math.max(0, monthlyLimit - used);
}

// A request is accepted only if BOTH plans allow it. The first failing rule is reported.
// Order: per-request rules first (waiting won't help, only a smaller request or a plan change),
// then monthly allowances. The user is checked before the account at each step.
export function evaluate(units: number, account: LevelState, user: LevelState): Decision {
  if (units > user.maxUnitsPerRequest) return { accepted: false, level: 'user', rule: 'max_units_per_request' };
  if (units > account.maxUnitsPerRequest) return { accepted: false, level: 'account', rule: 'max_units_per_request' };
  if (units > remaining(user.monthlyLimit, user.used)) return { accepted: false, level: 'user', rule: 'monthly_limit' };
  if (units > remaining(account.monthlyLimit, account.used)) return { accepted: false, level: 'account', rule: 'monthly_limit' };
  return { accepted: true };
}
