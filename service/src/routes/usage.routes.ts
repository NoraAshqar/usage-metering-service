import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { getAccountUsage, getRequestHistory, getUserUsage } from '../services/usage.service';
import { currentMonth } from '../utils/month';
import { optionalMonthQuery, optionalString, pageQuery } from '../utils/validation';

export const usageRouter = Router();

usageRouter.get('/usage', async (req, res) => {
  const month = optionalMonthQuery(req.query.month) ?? currentMonth();
  res.json(await getAccountUsage(accountIdOf(res), month, pageQuery(req.query)));
});

usageRouter.get('/users/:userId/usage', async (req, res) => {
  const month = optionalMonthQuery(req.query.month) ?? currentMonth();
  res.json(await getUserUsage(accountIdOf(res), req.params.userId, month));
});

usageRouter.get('/requests', async (req, res) => {
  const filter = {
    userId: optionalString(req.query.userId, 'userId'),
    month: optionalMonthQuery(req.query.month),
  };
  res.json(await getRequestHistory(accountIdOf(res), filter, pageQuery(req.query)));
});
