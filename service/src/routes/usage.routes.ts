import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { getAccountUsage, getRequestHistory, getUserUsage } from '../services/usage.service';
import { currentMonth } from '../utils/month';
import { optionalMonthQuery, optionalString, pageQuery } from '../utils/validation';

// Mounted at the root (paths are written in full below).
export const usageRouter = Router();

// GET /usage?month=2026-10&limit=20&offset=0
//   -> the account's used/remaining + one page of its users' used/remaining (default: this month)
usageRouter.get('/usage', async (req, res) => {
  const month = optionalMonthQuery(req.query.month) ?? currentMonth();
  res.json(await getAccountUsage(accountIdOf(res), month, pageQuery(req.query)));
});

// GET /users/:userId/usage?month=2026-10  ->  one user's used/remaining + the account's
usageRouter.get('/users/:userId/usage', async (req, res) => {
  const month = optionalMonthQuery(req.query.month) ?? currentMonth();
  res.json(await getUserUsage(accountIdOf(res), req.params.userId, month));
});

// GET /requests?userId=alice&month=2026-10&limit=20&offset=0
//   -> request history, newest first. Without month: all months. Without userId: all users.
usageRouter.get('/requests', async (req, res) => {
  const filter = {
    userId: optionalString(req.query.userId, 'userId'),
    month: optionalMonthQuery(req.query.month),
  };
  res.json(await getRequestHistory(accountIdOf(res), filter, pageQuery(req.query)));
});
