import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { pool } from '../db';
import { HttpError } from '../errors';
import { hashApiKey } from '../utils/apiKey';

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

export function accountIdOf(res: Response): number {
  return res.locals.accountId as number;
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.header('x-admin-key') !== config.adminKey) {
    throw new HttpError(401, 'invalid_admin_key', 'Send a valid admin key in the x-admin-key header');
  }
  next();
}
