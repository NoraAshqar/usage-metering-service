import { Router } from 'express';
import { accountIdOf } from '../middleware/auth';
import { consume } from '../services/consume.service';
import { requirePositiveInt, requireString } from '../utils/validation';

export const consumeRouter = Router();

consumeRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const input = {
    userId: requireString(body.userId, 'userId'),
    units: requirePositiveInt(body.units, 'units'),
    requestId: requireString(body.requestId, 'requestId'),
  };
  res.json(await consume(accountIdOf(res), input));
});
