import { Router } from 'express';

export const usersRouter = Router();

// TODO (Day 2):
//   POST /users                    -> register a user { externalId, planId }
//   GET  /users/:externalId        -> user + the plan applied to them
//   PUT  /users/:externalId/plan   -> switch the user's plan
//
// Plan check (on create and on switch): scope = 'user' AND (predefined OR owned by this account).
