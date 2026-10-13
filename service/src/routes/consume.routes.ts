import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { consume } from '../services/consume.service';
import { requirePositiveInt, requireString } from '../utils/validation';

// Mounted at /consume.
export const consumeRouter = Router();

// POST /consume  { userId, units, requestId }  ->  200 with the decision.
// A rejection is a normal answer (200, accepted: false), not an error:
// errors (4xx) mean the request itself was wrong (bad input, unknown user, reused requestId).
consumeRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const input = {
    userId: requireString(body.userId, 'userId'),
    units: requirePositiveInt(body.units, 'units'),
    requestId: requireString(body.requestId, 'requestId'),
  };
  res.json(await consume(accountIdOf(res), input));
});
