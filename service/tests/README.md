Tests - Node built-in test runner (node:test) + supertest against the real Postgres from docker compose:

- rules.test.ts        -> pure rule checks (per-request limit, monthly limit, remaining never negative)
- accounts-users.test.ts -> admin key, API key (missing/wrong -> 401), users, plan scope checks, account isolation
- consume.test.ts      -> accept, user-limit reject, account-limit reject, retry with same requestId
- plans.test.ts        -> custom plan update applies to next request, predefined plan is read-only
- concurrency.test.ts  -> 50 parallel requests never exceed the monthly limit
