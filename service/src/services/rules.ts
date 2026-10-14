export type Level = 'account' | 'user';
export type Rule = 'max_units_per_request' | 'monthly_limit';

export interface LevelState {
  monthlyLimit: number;
  maxUnitsPerRequest: number;
  used: number;
}

export type Decision =
  | { accepted: true }
  | { accepted: false; level: Level; rule: Rule };

export function remaining(monthlyLimit: number, used: number): number {
  return Math.max(0, monthlyLimit - used);
}

export function evaluate(units: number, account: LevelState, user: LevelState): Decision {
  if (units > user.maxUnitsPerRequest) return { accepted: false, level: 'user', rule: 'max_units_per_request' };
  if (units > account.maxUnitsPerRequest) return { accepted: false, level: 'account', rule: 'max_units_per_request' };
  if (units > remaining(user.monthlyLimit, user.used)) return { accepted: false, level: 'user', rule: 'monthly_limit' };
  if (units > remaining(account.monthlyLimit, account.used)) return { accepted: false, level: 'account', rule: 'monthly_limit' };
  return { accepted: true };
}
