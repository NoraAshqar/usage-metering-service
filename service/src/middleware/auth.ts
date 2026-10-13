import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { pool } from '../db';
import { HttpError } from '../errors';
import { hashApiKey } from '../utils/apiKey';

// Used by every account-level route.
// Finds the account that owns the API key and saves its id on res.locals.accountId.
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) {
    throw new HttpError(401, 'missing_api_key', 'Send your API key in the x-api-key header');
  }

  const result = await pool.query<{ id: number }>(
    'SELECT id FROM accounts WHERE api_key_hash = $1',
    [hashApiKey(apiKey)],
  );
  if (result.rowCount === 0) {
    throw new HttpError(401, 'invalid_api_key', 'API key is not valid');
  }

  res.locals.accountId = result.rows[0].id;
  next();
}

// The account id of the caller. Only valid in routes that run after requireApiKey.
export function accountIdOf(res: Response): number {
  return res.locals.accountId as number;
}

// Only used for creating accounts (the operator of this service holds the admin key).
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.header('x-admin-key') !== config.adminKey) {
    throw new HttpError(401, 'invalid_admin_key', 'Send a valid admin key in the x-admin-key header');
  }
  next();
}
