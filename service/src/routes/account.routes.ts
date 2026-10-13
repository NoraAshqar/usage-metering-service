import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { changeAccountPlan, getAccount } from '../services/accounts.service';
import { requirePositiveInt } from '../utils/validation';

// Mounted at /account. The account is always the one that owns the API key.
export const accountRouter = Router();

// GET /account  ->  my account and the plan applied to it
accountRouter.get('/', async (_req, res) => {
  res.json(await getAccount(accountIdOf(res)));
});

// PUT /account/plan  { planId }  ->  switch the account plan
accountRouter.put('/plan', async (req, res) => {
  const planId = requirePositiveInt(req.body?.planId, 'planId');
  res.json(await changeAccountPlan(accountIdOf(res), planId));
});
