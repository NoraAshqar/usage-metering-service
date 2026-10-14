import { Router } from 'express';
import { createAccount } from '../services/accounts.service';
import { optionalPositiveInt, requireString } from '../utils/validation';

export const adminRouter = Router();

adminRouter.post('/accounts', async (req, res) => {
  const body = req.body ?? {};
  const name = requireString(body.name, 'name');
  const planId = optionalPositiveInt(body.planId, 'planId');

  res.status(201).json(await createAccount(name, planId));
});
