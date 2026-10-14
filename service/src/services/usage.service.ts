import { pool } from '../db';
import { Page } from '../utils/validation';
import { ConsumeRequestRow, toRequestRecord } from './consume.service';
import { remaining } from './rules';
import { findUser } from './users.service';

// One level (account or user) in one month: used units + the plan's allowance.
interface UsageRow {
  used: number;
  plan_id: number;
  plan_name: string;
  monthly_limit: number;
}

// Plans are not versioned: monthlyLimit/remaining always use the CURRENT plan, also for past months.
// (The remaining value at the time of each decision is kept in the request history.)
function toUsage(row: UsageRow) {
  return {
    used: row.used,
    monthlyLimit: row.monthly_limit,
    remaining: remaining(row.monthly_limit, row.used),
    plan: { id: row.plan_id, name: row.plan_name },
  };
}

// Asks the database for limit + 1 rows: if the extra row exists, there is a next page.
function toPage<T>(rows: T[], page: Page) {
  return {
    items: rows.slice(0, page.limit),
    nextOffset: rows.length > page.limit ? page.offset + page.limit : null,
  };
}

// No usage row for a month simply means nothing was used: LEFT JOIN + COALESCE(used, 0).
async function accountUsage(accountId: number, month: string) {
  const result = await pool.query<UsageRow>(
    `SELECT COALESCE(au.used, 0) AS used, p.id AS plan_id, p.name AS plan_name, p.monthly_limit
     FROM accounts a
     JOIN plans p ON p.id = a.plan_id
     LEFT JOIN account_usage au ON au.account_id = a.id AND au.month = $2
     WHERE a.id = $1`,
    [accountId, month],
  );
  return toUsage(result.rows[0]);
}

async function userUsage(userDbId: number, month: string) {
  const result = await pool.query<UsageRow>(
    `SELECT COALESCE(uu.used, 0) AS used, p.id AS plan_id, p.name AS plan_name, p.monthly_limit
     FROM users u
     JOIN plans p ON p.id = u.plan_id
     LEFT JOIN user_usage uu ON uu.user_id = u.id AND uu.month = $2
     WHERE u.id = $1`,
    [userDbId, month],
  );
  return toUsage(result.rows[0]);
}

// GET /usage: the account's usage and one page of its users' usage (users without usage show 0).
export async function getAccountUsage(accountId: number, month: string, page: Page) {
  const users = await pool.query<UsageRow & { external_id: string }>(
    `SELECT u.external_id, COALESCE(uu.used, 0) AS used, p.id AS plan_id, p.name AS plan_name, p.monthly_limit
     FROM users u
     JOIN plans p ON p.id = u.plan_id
     LEFT JOIN user_usage uu ON uu.user_id = u.id AND uu.month = $2
     WHERE u.account_id = $1
     ORDER BY u.id
     LIMIT $3 OFFSET $4`,
    [accountId, month, page.limit + 1, page.offset],
  );
  const { items, nextOffset } = toPage(users.rows, page);

  return {
    month: month.slice(0, 7),
    account: await accountUsage(accountId, month),
    users: items.map((row) => ({ userId: row.external_id, ...toUsage(row) })),
    nextOffset,
  };
}

// GET /users/:userId/usage: the user's usage and the account's, since both limit what the user can do.
export async function getUserUsage(accountId: number, userId: string, month: string) {
  const user = await findUser(accountId, userId);
  return {
    month: month.slice(0, 7),
    userId,
    user: await userUsage(user.id, month),
    account: await accountUsage(accountId, month),
  };
}

export interface HistoryFilter {
  userId?: string;
  month?: string;
}

// GET /requests: accepted and rejected decisions, newest first.
// A filter that is not given is passed as NULL, and "$n IS NULL OR ..." then matches every row.
export async function getRequestHistory(accountId: number, filter: HistoryFilter, page: Page) {
  const userDbId = filter.userId ? (await findUser(accountId, filter.userId)).id : null;

  const result = await pool.query<ConsumeRequestRow & { external_id: string }>(
    `SELECT cr.*, u.external_id
     FROM consume_requests cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.account_id = $1
       AND ($2::int  IS NULL OR cr.user_id = $2)
       AND ($3::date IS NULL OR cr.month = $3)
     ORDER BY cr.id DESC
     LIMIT $4 OFFSET $5`,
    [accountId, userDbId, filter.month ?? null, page.limit + 1, page.offset],
  );
  const { items, nextOffset } = toPage(result.rows, page);

  return {
    requests: items.map((row) => toRequestRecord(row, row.external_id)),
    nextOffset,
  };
}
