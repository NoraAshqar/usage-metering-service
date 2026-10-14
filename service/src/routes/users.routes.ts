import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { changeUserPlan, createUser, getUser } from '../services/users.service';
import { optionalPositiveInt, requirePositiveInt, requireString } from '../utils/validation';

export const usersRouter = Router();

usersRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const userId = requireString(body.userId, 'userId');
  const planId = optionalPositiveInt(body.planId, 'planId');

  res.status(201).json(await createUser(accountIdOf(res), userId, planId));
});

usersRouter.get('/:userId', async (req, res) => {
  res.json(await getUser(accountIdOf(res), req.params.userId));
});

usersRouter.put('/:userId/plan', async (req, res) => {
  const planId = requirePositiveInt(req.body?.planId, 'planId');
  res.json(await changeUserPlan(accountIdOf(res), req.params.userId, planId));
});
