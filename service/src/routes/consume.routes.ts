import { Router } from 'express';

export const consumeRouter = Router();

// TODO (Day 4):
//   POST /consume  { userId, units, requestId }
//   -> validate input, call consume() from services/consume.service.ts, return the decision.
