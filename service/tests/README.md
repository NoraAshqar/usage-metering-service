Tests (Day 6) - vitest + supertest against the real Postgres from docker compose:

- rules.test.ts        -> pure rule checks (per-request limit, monthly limit, remaining never negative)
- auth.test.ts         -> missing key / wrong key -> 401, user of another account -> 404
- consume.test.ts      -> accept, user-limit reject, account-limit reject, retry with same requestId
- plans.test.ts        -> custom plan update applies to next request, predefined plan is read-only
- concurrency.test.ts  -> 50 parallel requests never exceed the monthly limit
