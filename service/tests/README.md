Tests - Node built-in test runner (node:test) + supertest against the real Postgres from docker compose:

- rules.test.ts          -> pure rule checks (per-request limit, monthly limit, remaining never negative)
- accounts-users.test.ts -> admin key, API key (missing/wrong -> 401), users, plan scope checks, account isolation
- consume.test.ts        -> brief examples, accounting, month rollover, plan changes, retries, errors
- plans.test.ts          -> list/create/update custom plans, predefined plans read-only, shared plans, plan isolation
- usage.test.ts          -> account/user usage, past months, remaining never negative, history filters, pagination, isolation
- concurrency.test.ts    -> parallel requests never exceed user/account limits; duplicate requestId counted once
