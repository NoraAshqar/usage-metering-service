import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { changeUserPlan, createUser, getUser } from '../services/users.service';
import { optionalPositiveInt, requirePositiveInt, requireString } from '../utils/validation';

// Mounted at /users. Only users of the calling account are visible.
export const usersRouter = Router();

// POST /users  { userId, planId? }  ->  201 the new user and its plan
usersRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const userId = requireString(body.userId, 'userId');
  const planId = optionalPositiveInt(body.planId, 'planId');

  res.status(201).json(await createUser(accountIdOf(res), userId, planId));
});

// GET /users/:userId  ->  the user and the plan applied to them
usersRouter.get('/:userId', async (req, res) => {
  res.json(await getUser(accountIdOf(res), req.params.userId));
});

// PUT /users/:userId/plan  { planId }  ->  switch the user's plan
usersRouter.put('/:userId/plan', async (req, res) => {
  const planId = requirePositiveInt(req.body?.planId, 'planId');
  res.json(await changeUserPlan(accountIdOf(res), req.params.userId, planId));
});
