import { Router } from 'express';

export const accountsRouter = Router();

// TODO (Day 2):
//   POST /accounts          (admin key)  -> create account + return the API key ONCE
//   GET  /account           (api key)    -> my account + its plan
//   PUT  /account/plan      (api key)    -> switch the account plan
//
// Plan check (on create and on switch): scope = 'account' AND (predefined OR owned by this account).
