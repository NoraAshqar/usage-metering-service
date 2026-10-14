import { PoolClient } from 'pg';
import { withTransaction } from '../db';
import { HttpError } from '../errors';
import { currentMonth } from '../utils/month';
import { Level, Rule, evaluate, remaining } from './rules';

export interface ConsumeInput {
  userId: string;
  units: number;
  requestId: string;
}

export interface ConsumeRequestRow {
  user_id: number;
  request_id: string;
  units: number;
  month: string;
  accepted: boolean;
  rejected_level: Level | null;
  rejected_rule: Rule | null;
  account_remaining: number;
  user_remaining: number;
  created_at: Date;
}

interface UserWithPlans {
  id: number;
  account_monthly_limit: number;
  account_max_units_per_request: number;
  user_monthly_limit: number;
  user_max_units_per_request: number;
}

export function toRequestRecord(row: ConsumeRequestRow, userId: string) {
  return {
    requestId: row.request_id,
    userId,
    units: row.units,
    accepted: row.accepted,
    rejectedBy: row.accepted ? null : { level: row.rejected_level, rule: row.rejected_rule },
    month: row.month.slice(0, 7),
    remaining: { account: row.account_remaining, user: row.user_remaining },
    decidedAt: row.created_at,
  };
}

function toDecisionResponse(row: ConsumeRequestRow, userId: string, replayed: boolean) {
  return { ...toRequestRecord(row, userId), replayed };
}

// Locks the usage row and returns `used`. Only the first request of the month has to create the row,
// because FOR UPDATE can't lock a row that doesn't exist yet.
async function lockUsageRow(client: PoolClient, table: 'account_usage' | 'user_usage', column: 'account_id' | 'user_id', id: number, month: string) {
  const select = `SELECT used FROM ${table} WHERE ${column} = $1 AND month = $2 FOR UPDATE`;
  let result = await client.query<{ used: number }>(select, [id, month]);
  if (result.rowCount === 0) {
    await client.query(`INSERT INTO ${table} (${column}, month) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, month]);
    result = await client.query<{ used: number }>(select, [id, month]);
  }
  return result.rows[0].used;
}

function lockAccountUsage(client: PoolClient, accountId: number, month: string) {
  return lockUsageRow(client, 'account_usage', 'account_id', accountId, month);
}

function lockUserUsage(client: PoolClient, userDbId: number, month: string) {
  return lockUsageRow(client, 'user_usage', 'user_id', userDbId, month);
}

export async function consume(accountId: number, input: ConsumeInput, now: Date = new Date()) {
  const month = currentMonth(now);

  return withTransaction(async (client) => {
    const userResult = await client.query<UserWithPlans>(
      `SELECT u.id,
              ap.monthly_limit         AS account_monthly_limit,
              ap.max_units_per_request AS account_max_units_per_request,
              up.monthly_limit         AS user_monthly_limit,
              up.max_units_per_request AS user_max_units_per_request
       FROM users u
       JOIN accounts a ON a.id = u.account_id
       JOIN plans ap   ON ap.id = a.plan_id
       JOIN plans up   ON up.id = u.plan_id
       WHERE u.account_id = $1 AND u.external_id = $2`,
      [accountId, input.userId],
    );
    if (userResult.rowCount === 0) {
      throw new HttpError(404, 'user_not_found', `User ${input.userId} not found`);
    }
    const p = userResult.rows[0];

    // Always lock the account row before the user row, so transactions can't deadlock.
    const accountUsed = await lockAccountUsage(client, accountId, month);

    // Checked after the lock: a concurrent request with the same requestId waits above,
    // then finds the decision saved by the first one.
    const previous = await client.query<ConsumeRequestRow>(
      'SELECT * FROM consume_requests WHERE account_id = $1 AND request_id = $2',
      [accountId, input.requestId],
    );
    if (previous.rowCount) {
      const original = previous.rows[0];
      if (original.user_id !== p.id || original.units !== input.units) {
        throw new HttpError(409, 'request_id_conflict', `requestId ${input.requestId} was already used for a different request`);
      }
      return toDecisionResponse(original, input.userId, true);
    }

    const userUsed = await lockUserUsage(client, p.id, month);

    const account = { monthlyLimit: p.account_monthly_limit, maxUnitsPerRequest: p.account_max_units_per_request, used: accountUsed };
    const user = { monthlyLimit: p.user_monthly_limit, maxUnitsPerRequest: p.user_max_units_per_request, used: userUsed };

    const decision = evaluate(input.units, account, user);

    if (decision.accepted) {
      account.used += input.units;
      user.used += input.units;
      await client.query(
        'UPDATE account_usage SET used = used + $1 WHERE account_id = $2 AND month = $3',
        [input.units, accountId, month],
      );
      await client.query(
        'UPDATE user_usage SET used = used + $1 WHERE user_id = $2 AND month = $3',
        [input.units, p.id, month],
      );
    }

    const saved = await client.query<ConsumeRequestRow>(
      `INSERT INTO consume_requests
         (account_id, user_id, request_id, units, month, accepted, rejected_level, rejected_rule,
          account_remaining, user_remaining)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        accountId,
        p.id,
        input.requestId,
        input.units,
        month,
        decision.accepted,
        decision.accepted ? null : decision.level,
        decision.accepted ? null : decision.rule,
        remaining(account.monthlyLimit, account.used),
        remaining(user.monthlyLimit, user.used),
      ],
    );

    return toDecisionResponse(saved.rows[0], input.userId, false);
  });
}
