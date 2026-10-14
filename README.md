# Usage Metering and Quota Service

A backend service that other applications call before a user performs an action. It checks the
calling account's plan and the user's plan, records the decision, and counts the units if the
request is accepted.

Stack: TypeScript, Express 5, PostgreSQL 16 (plain SQL with `pg`), Docker Compose.

- [Quick start](#quick-start) · [Demo client](#demo-client) · [Tests](#tests)
- [Accounts, users and plans](#accounts-users-and-plans) · [API](#api)
- [Rules](#rules) · [Plan changes](#plan-changes) · [Retries](#retries-requestid) · [Concurrency](#how-concurrent-requests-stay-correct)
- [Data model](#data-model) · [Performance](#performance) · [Design decisions](#design-decisions)
- [Product assumptions](#product-assumptions) · [Known limitations](#known-limitations) · [Project structure](#project-structure)

## Quick start

Requirements: Docker with Docker Compose.

```bash
docker compose up --build
```

This starts PostgreSQL, the service and the demo client. The client runs its scenario once and
exits; the service keeps running.

- Service: http://localhost:3000 (`GET /health` returns `{"status":"ok"}`)
- PostgreSQL: localhost:5432 (user, password and database: `metering`)
- Admin key for creating accounts: `admin-secret` (`ADMIN_KEY` in `docker-compose.yml`)

On startup the service applies any new SQL files from `service/migrations/` (schema + predefined
plans) and records them in the `schema_migrations` table, so restarts keep all data.
Schema changes are added as new numbered files. To wipe all data: `docker compose down -v`.

## Demo client

`client/` is a small command-line app that plays a document processing company. It uses only
the public API with its own API key, and runs automatically with `docker compose up --build`.
Its output is in the `client` logs:

```bash
docker compose logs client        # output of the run during startup
docker compose run --rm client    # run it again (every run creates a new account)
```

To run it outside Docker (the service must be running on port 3000):

```bash
cd client
npm install
npm run build
npm start
```

What it shows:

| Step | What happens | Result |
|---|---|---|
| Setup | Account on a custom plan "Small Team" (300/month, 100/request); alice on Basic, bob on Premium | |
| 1 | alice, 10 units | accepted |
| 2 | alice, 25 units | rejected by the **user** plan (`max_units_per_request`) |
| 3 | bob, 3 × 100 units | the third is rejected by the **account** plan (`monthly_limit`), although bob has 4,800 left |
| 4 | alice is switched to Premium and sends 25 units again | accepted |
| 5 | the account plan is raised to 1,000/month and bob sends 100 units again | accepted |
| 6 | the request from step 1 is sent again with the same `requestId` | original decision, nothing charged again |
| Summary | `GET /usage` | table of used / limit / remaining per account and user |

Steps 4 and 5 change what users can do through the API only: the client code stays the same.

Configuration (environment variables): `SERVICE_URL` (default `http://localhost:3000`) and
`ADMIN_KEY` (default `admin-secret`).

## Tests

The tests use Node's built-in test runner (`node:test`) with `supertest`, against the Postgres
from Docker Compose. Requirements: Node.js 22.

```bash
docker compose up -d db
cd service
npm install
npm test
```

Every test creates its own accounts, so tests don't depend on each other or on existing data.

| File | Covers |
|---|---|
| `rules.test.ts` | the rule evaluation on its own (no database) |
| `accounts-users.test.ts` | admin key, API key validation (missing / invalid), users, plan scope checks, account isolation |
| `plans.test.ts` | custom plans, read-only predefined plans, shared plans, plan isolation |
| `consume.test.ts` | the examples from the brief, accounting, new month, plan changes, retries, errors |
| `usage.test.ts` | usage per account and user, past months, history filters and pagination, isolation |
| `concurrency.test.ts` | parallel requests never exceed a limit, a duplicated `requestId` is counted once |

## Accounts, users and plans

| Concept | In this service |
|---|---|
| Account | An application calling the service. Identified by its API key. Has one **account plan** with limits shared by all its users. |
| User | A user of that application, registered under one account with the `userId` the application already uses. Has one **user plan** with their own limits. |
| Plan | A name and two rules (`monthlyLimit`, `maxUnitsPerRequest`) with a scope: `account` or `user`. Either predefined (shared by all accounts, read-only) or custom (owned by one account). |
| Units | The single resource being metered, e.g. document processing credits. |

A request has to satisfy the account plan **and** the user plan. A bigger user plan does not
increase the account's shared allowance. Users on the same plan share the plan's rules, not its
allowance: each user has their own usage.

### Predefined plans

Created on startup by `service/migrations/002_seed_plans.sql`:

| Plan    | Scope   | Monthly allowance | Max units / request |
|---------|---------|------------------:|--------------------:|
| Starter | account |            10,000 |                 100 |
| Pro     | account |           100,000 |                 500 |
| Basic   | user    |             1,000 |                  20 |
| Premium | user    |             5,000 |                 100 |

Starter fits a small team (10 Basic users using everything would need exactly 10,000). Pro is ten
times bigger. Premium users get 5× the Basic allowance and bigger single requests.

### API keys

1. The operator of the service creates an account with the admin key:
   `POST /admin/accounts` with header `x-admin-key: admin-secret`.
2. The response contains the account's API key (`mk_...`) **once**. Only its SHA-256 hash is stored.
3. The calling application sends the key in the `x-api-key` header on every other request.
   A missing or unknown key gets `401`. The key decides which account the request belongs to:
   an account can only see and change its own users, plans, usage and history.

## API

All bodies are JSON. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

### Accounts

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/admin/accounts` | `x-admin-key` | `{ name, planId? }` | `201 { account, apiKey }` |
| GET | `/account` | `x-api-key` | - | my account and its plan |
| PUT | `/account/plan` | `x-api-key` | `{ planId }` | account with the new plan |

```bash
curl -X POST localhost:3000/admin/accounts -H "x-admin-key: admin-secret" \
  -H "content-type: application/json" -d '{"name":"Acme Docs"}'
```

### Users

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/users` | `{ userId, planId? }` | `201` user and its plan, `409` if it exists |
| GET | `/users/:userId` | - | user and its plan |
| PUT | `/users/:userId/plan` | `{ planId }` | user with the new plan |

`userId` is the identifier the calling application already uses for its user (any string).

```bash
curl -X POST localhost:3000/users -H "x-api-key: <key>" \
  -H "content-type: application/json" -d '{"userId":"alice","planId":4}'
```

### Plans

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/plans` | - | `{ plans }`: predefined plans, then my custom plans |
| GET | `/plans/:planId` | - | one plan (`404` for another account's plan) |
| POST | `/plans` | `{ name, scope, monthlyLimit, maxUnitsPerRequest }` | `201` the new custom plan |
| PATCH | `/plans/:planId` | any of `{ name, monthlyLimit, maxUnitsPerRequest }` | the updated plan |

`scope` is `"account"` (assignable to the account) or `"user"` (assignable to its users).
A plan is returned as:

```json
{ "id": 5, "name": "Gold", "scope": "user", "monthlyLimit": 2000, "maxUnitsPerRequest": 50, "predefined": false }
```

```bash
curl -X POST localhost:3000/plans -H "x-api-key: <key>" -H "content-type: application/json" \
  -d '{"name":"Gold","scope":"user","monthlyLimit":2000,"maxUnitsPerRequest":50}'

curl -X PATCH localhost:3000/plans/5 -H "x-api-key: <key>" -H "content-type: application/json" \
  -d '{"monthlyLimit":300}'
```

### Consume units

`POST /consume` with `{ userId, units, requestId }`:

```bash
curl -X POST localhost:3000/consume -H "x-api-key: <key>" -H "content-type: application/json" \
  -d '{"userId":"alice","units":25,"requestId":"doc-123"}'
```

```json
{
  "requestId": "doc-123",
  "userId": "alice",
  "units": 25,
  "accepted": false,
  "rejectedBy": { "level": "user", "rule": "max_units_per_request" },
  "month": "2026-10",
  "remaining": { "account": 10000, "user": 1000 },
  "replayed": false,
  "decidedAt": "2026-10-15T09:12:44.120Z"
}
```

- A decision is always `200`. When `accepted` is `false`, `rejectedBy` names the rule and
  whether it belongs to the account or the user plan. A rejection consumes nothing.
- `remaining` is what is left this month after this decision, for the account and the user.
- `4xx` means the request itself was wrong: `400` invalid input, `401` API key, `404` unknown user,
  `409` requestId already used for a different request.

### Usage and history

| Method | Path | Query | Result |
|---|---|---|---|
| GET | `/usage` | `month?`, `limit?`, `offset?` | the account's usage and one page of its users' usage |
| GET | `/users/:userId/usage` | `month?` | one user's usage and the account's usage |
| GET | `/requests` | `userId?`, `month?`, `limit?`, `offset?` | request history (accepted and rejected), newest first |

- `month` looks like `2026-10`. Default for usage: the current UTC month. Default for history: all months.
- `limit` is 1-100 (default 20), `offset` is the number of rows to skip (default 0).
  `nextOffset` in the response is the `offset` for the next page, or `null` on the last page.

```bash
curl "localhost:3000/usage?month=2026-10" -H "x-api-key: <key>"
```

```json
{
  "month": "2026-10",
  "account": { "used": 35, "monthlyLimit": 10000, "remaining": 9965, "plan": { "id": 1, "name": "Starter" } },
  "users": [
    { "userId": "alice", "used": 20, "monthlyLimit": 1000, "remaining": 980, "plan": { "id": 3, "name": "Basic" } },
    { "userId": "bob",   "used": 15, "monthlyLimit": 1000, "remaining": 985, "plan": { "id": 3, "name": "Basic" } }
  ],
  "nextOffset": null
}
```

```bash
curl "localhost:3000/requests?userId=alice&limit=2" -H "x-api-key: <key>"
```

Each history entry has the same fields as a `/consume` response (without `replayed`).
`remaining` there is the value **at the time of the decision**.

## Rules

Each plan has two rules, and a request must satisfy **both** the account plan and the user plan:

| Rule | Meaning |
|---|---|
| `max_units_per_request` | the most units one request may consume |
| `monthly_limit` | the total units available in a UTC calendar month |

Rules are checked in this order, and the first one that fails is reported:

1. user `max_units_per_request`
2. account `max_units_per_request`
3. user `monthly_limit`
4. account `monthly_limit`

Per-request rules come first because waiting will not fix them, only a smaller request or a
plan change. An accepted request adds its units to the user's usage **and** to the account's
usage, so the account's usage is always the sum of its users' usage.

Usage is stored per UTC month (`2026-10-01` = October 2026). A new month starts at zero for
both levels. Previous months stay in the database.

No other rule types were added. The two required rules cover the brief, and a smaller, fully
tested core was the priority. `evaluate()` in `service/src/services/rules.ts` is a pure function
of the plans and the current usage, so a new rule (for example a daily limit) would be one more
column on `plans`, one more `if` in `evaluate()`, and one more usage counter.

## Plan changes

- `consume` reads the account plan and the user plan **at the start of every request**. A plan
  update or a plan switch applies to every request that starts after it succeeds, with no restart.
  A request that was already waiting for the account lock when the change happened is decided
  with the plans it read when it started.
- Switching plans keeps the units already used this month: there is no fresh allowance.
- If a monthly limit is lowered below what was already used, `remaining` is shown as `0`
  (never negative) and further requests are rejected at that level.
- Past decisions in the request history are never changed.

## Retries (`requestId`)

The caller sends a unique `requestId` for every action. If a response is lost, the caller can
safely send the **same** request again:

| Retry | Result |
|---|---|
| same `requestId`, same `userId` and `units` | the **original** decision, with `replayed: true`. Nothing is consumed again |
| same `requestId`, different `userId` or `units` | `409 request_id_conflict` |

A retry is never re-evaluated. A request that was rejected stays rejected even if the plan
changed since then, and an accepted request stays accepted. To try again after a rejection,
send a new `requestId`. Every `requestId` belongs to one account, so two accounts may use the same value.

## How concurrent requests stay correct

`consume` runs in one database transaction:

1. Find the user inside the calling account together with both current plans (`404` otherwise).
2. **Lock** this month's `account_usage` row (`SELECT ... FOR UPDATE`). On the first request of
   the month the row doesn't exist yet, so it is created first (`INSERT ... ON CONFLICT DO NOTHING`).
3. Look for an earlier request with the same `requestId` and return it if there is one.
4. Lock the user's `user_usage` row the same way.
5. Evaluate the rules (`rules.ts`, a pure function).
6. If accepted, add the units to both counters.
7. Save the decision in `consume_requests` and commit.

The lock in step 2 makes requests **of the same account** run one after another from that
point, so two requests can never both read the same `used` value. Requests of different
accounts don't wait for each other. The account row is always locked before the user row,
so two transactions can never wait for each other (no deadlocks). The `requestId` check comes
after the lock: if the same `requestId` arrives twice at once, the second one waits and then
finds the first one's saved decision.

`tests/concurrency.test.ts` sends 50 parallel requests against a 100-unit user allowance and
40 parallel requests against a 100-unit account allowance, and checks that exactly 100 units are
accepted and that the counters match the request history. As a check of the test itself, we
removed `FOR UPDATE` and ran it again: 27 of the 50 requests were accepted (270 units for a
100-unit allowance), so the test does catch the race.

## Data model

Defined in `service/migrations/001_schema.sql`.

| Table | One row per | Main columns |
|---|---|---|
| `accounts` | calling application | `api_key_hash` (unique), `plan_id` |
| `plans` | plan | `account_id` (`NULL` = predefined), `scope`, `monthly_limit`, `max_units_per_request` |
| `users` | user of an account | `account_id`, `external_id` (the API's `userId`), `plan_id` |
| `account_usage` | account and month | `used` |
| `user_usage` | user and month | `used` |
| `consume_requests` | decision, accepted or rejected | `request_id`, `units`, `accepted`, `rejected_level`, `rejected_rule`, remaining values |

Constraints that protect the data even if the code had a bug:

- `UNIQUE (account_id, request_id)`: a request can't be stored twice.
- `FOREIGN KEY (user_id, account_id) REFERENCES users (id, account_id)`: a request can only be
  stored for a user of the same account.
- `CHECK`s: units are positive, `used` and remaining values are never negative, `month` is always
  the first day of a month, and a rejected request always has a level and a rule while an
  accepted one has neither.
- Unique plan names per owner and scope (two partial unique indexes, because `NULL` is never equal
  to `NULL` in a normal `UNIQUE` constraint).

Migrations: on startup the service runs every file in `service/migrations/` that is not yet in
the `schema_migrations` table, in name order, each in its own transaction (`src/migrate.ts`).

## Performance

### How it was tested

`load-test/run.js` uses [autocannon](https://github.com/mcollina/autocannon) to send
`POST /consume` requests with 50 concurrent connections, 20 seconds per scenario. It runs in a
container on the same Docker network as the service, so it needs nothing installed but Docker:

```bash
docker compose up --build -d
LABEL=my-run docker compose --profile loadtest run --rm --build loadtest
```

`DURATION` and `CONNECTIONS` can be set the same way as `LABEL`. The report is printed and saved to
`load-test/results/<LABEL>.md`.

| Scenario | Setup | What it measures |
|---|---|---|
| `spread` | 20 accounts × 5 users, 1-10 units | throughput when requests rarely wait for each other |
| `hot-account` | 1 account × 50 users, 1-10 units | every request waits for the same account lock |
| `limit-reached` | 1 account with 5,000 units, 10 units per request | correctness when the limit is hit under load |

After each scenario the script checks in SQL, for every account it used:

- the account counter equals the sum of accepted units in `consume_requests`,
- the sum of the user counters equals the account counter,
- the account never went over its monthly limit,
- every `2xx` response has a stored decision.

All checks passed in every run. In `limit-reached` exactly 500 requests were accepted, i.e.
exactly the 5,000-unit limit, and the rest were rejected by the account plan.

### Results

Machine: laptop with an Intel Core i5-1235U and 8 GB RAM, Windows 11, Docker Desktop (WSL 2,
12 CPUs, 3.7 GB RAM for Docker). The load generator, the service and Postgres all run on the
same machine, so the numbers are only useful for comparing versions, not as absolute capacity.

Single runs on this laptop varied by up to ±20%, so the two versions were run alternately three
times (old, new, old, new, old, new). The table shows the median of the three runs; every run
is in `load-test/results/ab-*.md`.

| Scenario | Requests/s before | Requests/s after | p50 before | p50 after | p99 before | p99 after |
|---|---:|---:|---:|---:|---:|---:|
| spread | 269 | 283 (+5%) | 174 ms | 154 ms | 342 ms | 567 ms |
| hot-account | 120 | 152 (+27%) | 377 ms | 347 ms | 832 ms | 547 ms |
| limit-reached | 147 | 202 (+37%) | 318 ms | 219 ms | 593 ms | 517 ms |

No run had errors or non-`2xx` responses.

### What we found and changed

**1. The Node process was the first bottleneck.** During the first runs, the service container
used ~100% CPU (one full core: Node runs JavaScript on one thread) while Postgres used ~240% of
12 CPUs, and most database connections were idle waiting for the service (`ClientRead`).
Every query costs CPU in Node and a network round trip, so the fix was to send fewer queries:

| Database round trips per `/consume` | Before | After |
|---|---:|---:|
| accepted request | 13 | 8 |
| rejected request | 11 | 6 |
| while holding the account lock | 8 | 6 |

- The API key lookup is cached in memory. Keys can't change and accounts can't be deleted, so a
  cached key can't become wrong.
- The user and both plans are read in one query.
- The usage rows are locked with a single `SELECT ... FOR UPDATE`. The `INSERT` that creates the
  row is only needed for the first request of the month.

**2. The account lock limits one account's throughput.** All requests of the same account wait
for each other at the account row, so one account can only go as fast as one transaction after
another: `hot-account` is about half of `spread`. This is the price of exact totals. Reading the
plans before taking the lock shortened the time each request holds it, which is why
`hot-account` and `limit-reached` gained the most.

**3. An idea that made it worse.** We first replaced `INSERT` + `SELECT ... FOR UPDATE` with one
`INSERT ... ON CONFLICT DO UPDATE SET used = used RETURNING used`. It is one statement instead
of two, but it writes a new version of the row on every request. On a single hot row this made
`limit-reached` slower (109 instead of ~160 requests/s) and doubled the p99, so it was replaced
by the `SELECT ... FOR UPDATE` fast path.

**4. `spread` barely changed.** The difference between the versions (+5%) is smaller than the
noise between runs, and its p99 got worse in two of three runs. With requests spread over many
accounts, the limit is the single Node process and the shared laptop CPU, not the queries.

### Possible next steps

- Run several service processes (Node cluster or more containers). Correctness does not depend
  on the service process, only on the database locks, so this needs no code change.
- Put the counter updates and the history insert into one statement to shorten the lock further.
- For a very hot account: give up exact real-time totals, e.g. reserve units in batches per
  process. That would trade accuracy for throughput, so it is not done here.

## Design decisions

**Usage counters next to the history.** Usage is kept in small counter tables per month
(`account_usage`, `user_usage`) instead of summing `consume_requests` on every request. A decision
reads two rows instead of a growing history, and the counter row is the natural thing to lock.
The history is still complete, and the tests and the load test check that both always agree.

**Row locks for concurrency.** Each request locks the account's usage row, then the user's
(`SELECT ... FOR UPDATE`). Alternatives considered:

- *A conditional update* (`UPDATE ... SET used = used + n WHERE used + n <= limit`) is one statement
  per level, but with two levels it needs extra work to undo the first update when the second fails,
  and to find out which rule rejected the request.
- *`SERIALIZABLE` isolation* would also be correct, but conflicting requests fail and must be retried,
  which is more code and more work exactly when an account is busy.

Explicit locks keep the decision a normal piece of TypeScript (`evaluate()`) that runs on
values nobody else can change at that moment. The cost is that requests of one account run one
after another (see [Performance](#performance)).

**Idempotency in the same table.** The `requestId` is stored with the decision in
`consume_requests` under a unique constraint, so the retry check needs no extra table.

**Rules as a pure function.** `rules.ts` has no database access. It is easy to read, has its own
unit tests, and the consume service only loads data, locks, and saves.

**Plain SQL, no ORM.** The locking and the queries are the core of this service, so they are
written out in SQL where they can be read and explained directly.

**SHA-256 for API keys.** Keys are 24 random bytes, so a slow password hash (bcrypt) is not
needed, and a deterministic hash lets the service find the account with an index lookup.

**Plans by reference.** Accounts and users store a `plan_id`, not a copy of the limits, so a
plan update reaches everyone on that plan on their next request without any extra work.

**Small dependency list.** Express 5 (async errors reach the error handler without wrappers),
`pg`, and Node's built-in test runner. Migrations are a short script (`src/migrate.ts`) instead of a library.

## Product assumptions

- **Default plans:** an account created without `planId` gets **Starter**; a user gets **Basic**.
- **Plan assignment:** an account plan must have scope `account`, a user plan scope `user`, and the
  plan must be predefined or owned by the same account. Otherwise `400 invalid_plan`.
  Another account's plan gives the same error as a missing plan, so nothing leaks between accounts.
- **Isolation:** a user of another account is answered with `404`, exactly like a user that does not exist.
  The same `userId` may exist in two different accounts.
- **Creating accounts** needs a single admin key from the environment. There are no admin users or roles.
- **Predefined plans are read-only** (`403 plan_read_only`). To get different limits, create a custom plan.
- **Plans are shared by reference.** Users on the same plan share the plan *definition*, not the
  allowance: each user still has their own usage. Updating a custom plan changes the limits for
  everyone assigned to it, starting with their next request.
- **A plan's scope cannot change** after it is created, so existing assignments always stay valid.
- **Plan names are unique** per account and scope (`409 plan_name_taken`). The same name may be
  used by another account, or by the same account for the other scope.
- **`monthlyLimit` may be 0** (a plan that blocks all consumption, e.g. a suspended account).
  `maxUnitsPerRequest` must be at least 1.
- **Plans cannot be deleted.** Deleting a plan that is assigned, or that past requests were
  decided under, would need extra rules; it is not required, so it is left out.
- **A rejection is a normal answer** (`200` with `accepted: false`), not an HTTP error, so the
  caller can tell "not allowed by the plan" apart from "your request was wrong".
- **Rejected requests are stored** in the history too, so a caller can see why an action failed.
- **The month of a request** is the UTC month in which the service processes it.
- **Usage of past months uses today's plan.** Plans are not versioned, so `monthlyLimit` and
  `remaining` in `/usage` are computed with the current plan, also for past months. The exact
  remaining values at the time of each decision are kept in `/requests`.
- **Users without usage** in a month are listed with `used: 0`.
- **Pagination uses `limit`/`offset`.** It is simple, but if new requests arrive while a caller is
  paging through the history, an entry can appear on two pages. A cursor (`?before=<id>`) would
  avoid that; offset is enough for this scope.

## Known limitations

- **One account's throughput is limited by its lock.** Requests of the same account are decided
  one after another. Many accounts scale well; one very busy account does not.
- **One service process.** Node uses one CPU core, which was the first bottleneck in the load
  test. Running several instances would work without code changes, because correctness relies
  only on the database locks; the in-memory API key cache is safe per instance.
- **Plans are not versioned.** `/usage` for a past month uses today's plan limits. The remaining
  values at decision time are kept in `/requests`.
- **No key rotation or revocation, no deleting accounts, users or plans.** The API key cache relies
  on this; adding revocation would also mean clearing the cache.
- **A single admin key** for creating accounts, compared as a plain string. No admin users or roles.
- **The request history grows forever.** A real deployment would partition `consume_requests`
  by month or archive old months.
- **Offset pagination** can repeat an entry across pages if new requests arrive while paging.
- **The month comes from the service's clock** (UTC). With several instances, their clocks would
  need to agree around midnight at the end of a month.
- **Tests use the same database as the Docker Compose stack.** They create their own accounts, so
  they don't interfere with other data, but they do leave test data behind.
- **No HTTPS or rate limiting** in the service itself; it is meant to run behind a proxy that
  handles them.

## Project structure

```
docker-compose.yml        db, service, client (+ loadtest profile)
service/
  migrations/             numbered SQL files: schema, predefined plans
  src/
    index.ts              runs migrations, starts the server
    app.ts                Express app: routes and middleware
    migrate.ts            applies new migration files
    middleware/auth.ts    API key and admin key checks
    routes/               HTTP: input validation and responses
    services/             SQL and business logic
      rules.ts            rule evaluation (pure function)
      consume.service.ts  the consume transaction
    utils/                validation, API keys, month helper
  tests/                  node:test + supertest
client/                   demo command-line client
load-test/                autocannon load test and results
```
