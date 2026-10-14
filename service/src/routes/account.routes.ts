import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { changeAccountPlan, getAccount } from '../services/accounts.service';
import { requirePositiveInt } from '../utils/validation';

export const accountRouter = Router();

accountRouter.get('/', async (_req, res) => {
  res.json(await getAccount(accountIdOf(res)));
});

accountRouter.put('/plan', async (req, res) => {
  const planId = requirePositiveInt(req.body?.planId, 'planId');
  res.json(await changeAccountPlan(accountIdOf(res), planId));
});
