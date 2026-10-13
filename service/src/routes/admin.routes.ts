import { Router } from 'express';
import { createAccount } from '../services/accounts.service';
import { optionalPositiveInt, requireString } from '../utils/validation';

// Mounted at /admin behind requireAdmin (see app.ts).
export const adminRouter = Router();

// POST /admin/accounts  { name, planId? }  ->  201 { account, apiKey }
adminRouter.post('/accounts', async (req, res) => {
  const body = req.body ?? {};
  const name = requireString(body.name, 'name');
  const planId = optionalPositiveInt(body.planId, 'planId');

  res.status(201).json(await createAccount(name, planId));
});
