import { Router } from 'express';

export const usageRouter = Router();

// TODO (Day 5):
//   GET /usage?month=2026-10                      -> account used/remaining + each user's used/remaining
//   GET /users/:externalId/usage?month=2026-10    -> one user's used/remaining
//   GET /requests?userId=&month=&limit=&offset=   -> request history (paginated)
