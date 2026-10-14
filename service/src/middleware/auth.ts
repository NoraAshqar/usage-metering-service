import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { pool } from '../db';
import { HttpError } from '../errors';
import { hashApiKey } from '../utils/apiKey';

// API keys can't be changed and accounts can't be deleted, so a found key never goes stale.
const accountIdByKeyHash = new Map<string, number>();

async function findAccountId(apiKey: string): Promise<number | undefined> {
  const keyHash = hashApiKey(apiKey);
  const cached = accountIdByKeyHash.get(keyHash);
  if (cached !== undefined) return cached;

  const result = await pool.query<{ id: number }>('SELECT id FROM accounts WHERE api_key_hash = $1', [keyHash]);
  if (result.rowCount === 0) return undefined;

  accountIdByKeyHash.set(keyHash, result.rows[0].id);
  return result.rows[0].id;
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) {
    throw new HttpError(401, 'missing_api_key', 'Send your API key in the x-api-key header');
  }

  const accountId = await findAccountId(apiKey);
  if (accountId === undefined) {
    throw new HttpError(401, 'invalid_api_key', 'API key is not valid');
  }

  res.locals.accountId = accountId;
  next();
}

export function accountIdOf(res: Response): number {
  return res.locals.accountId as number;
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.header('x-admin-key') !== config.adminKey) {
    throw new HttpError(401, 'invalid_admin_key', 'Send a valid admin key in the x-admin-key header');
  }
  next();
}
