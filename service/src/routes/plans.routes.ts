import { Router } from 'express';
import { HttpError } from '../errors';
import { accountIdOf } from '../middleware/auth';
import { PLAN_SCOPES, createPlan, getVisiblePlan, listPlans, updatePlan } from '../services/plans.service';
import {
  optionalNonNegativeInt,
  optionalPositiveInt,
  optionalString,
  requireIdParam,
  requireNonNegativeInt,
  requireOneOf,
  requirePositiveInt,
  requireString,
} from '../utils/validation';

// Mounted at /plans.
export const plansRouter = Router();

// GET /plans  ->  { plans: [...] }  predefined plans first, then my custom plans
plansRouter.get('/', async (_req, res) => {
  res.json({ plans: await listPlans(accountIdOf(res)) });
});

// GET /plans/:planId  ->  one plan (predefined or mine)
plansRouter.get('/:planId', async (req, res) => {
  const planId = requireIdParam(req.params.planId, 'planId');
  res.json(await getVisiblePlan(accountIdOf(res), planId));
});

// POST /plans  { name, scope, monthlyLimit, maxUnitsPerRequest }  ->  201 the new custom plan
plansRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const plan = {
    name: requireString(body.name, 'name'),
    scope: requireOneOf(body.scope, 'scope', PLAN_SCOPES),
    monthlyLimit: requireNonNegativeInt(body.monthlyLimit, 'monthlyLimit'),
    maxUnitsPerRequest: requirePositiveInt(body.maxUnitsPerRequest, 'maxUnitsPerRequest'),
  };
  res.status(201).json(await createPlan(accountIdOf(res), plan));
});

// PATCH /plans/:planId  { name?, monthlyLimit?, maxUnitsPerRequest? }  ->  the updated plan
plansRouter.patch('/:planId', async (req, res) => {
  const planId = requireIdParam(req.params.planId, 'planId');
  const body = req.body ?? {};
  if (body.scope !== undefined) {
    throw new HttpError(400, 'validation_error', 'scope cannot be changed; create a new plan instead');
  }
  const changes = {
    name: optionalString(body.name, 'name'),
    monthlyLimit: optionalNonNegativeInt(body.monthlyLimit, 'monthlyLimit'),
    maxUnitsPerRequest: optionalPositiveInt(body.maxUnitsPerRequest, 'maxUnitsPerRequest'),
  };
  if (Object.values(changes).every((value) => value === undefined)) {
    throw new HttpError(400, 'validation_error', 'Send at least one of: name, monthlyLimit, maxUnitsPerRequest');
  }
  res.json(await updatePlan(accountIdOf(res), planId, changes));
});
