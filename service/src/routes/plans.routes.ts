import { Router } from 'express';

export const plansRouter = Router();

// TODO (Day 3):
//   GET  /plans        -> predefined plans + my own custom plans
//   GET  /plans/:id    -> one plan (only if predefined or mine)
//   POST /plans        -> create a custom plan
//   PUT  /plans/:id    -> update a custom plan (predefined = 403 read-only)
//                         remember: SET ..., updated_at = now()  (DEFAULT only works on INSERT)
//   duplicate name for the same account + scope -> 409 (unique index in 001_schema.sql)
