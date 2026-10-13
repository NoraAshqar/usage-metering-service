# Usage Metering and Quota Service

> Work in progress. Sections will be filled in as each part is built.

## Run

```bash
docker compose up --build
```

- Service: http://localhost:3000/health
- PostgreSQL: localhost:5432 (user/password/db: `metering`)

On startup the service applies any new SQL files from `service/migrations/` (schema + predefined
plans) and records them in the `schema_migrations` table, so restarts keep all data.
Schema changes are added as new numbered files. To wipe all data: `docker compose down -v`.

## Predefined plans

| Plan    | Level   | Monthly allowance | Max units / request |
|---------|---------|------------------:|--------------------:|
| Starter | account |            10,000 |                 100 |
| Pro     | account |           100,000 |                 500 |
| Basic   | user    |             1,000 |                  20 |
| Premium | user    |             5,000 |                 100 |

## Tests

The tests use Node's built-in test runner and the Postgres from Docker Compose:

```bash
docker compose up -d db
cd service
npm install
npm test
```

## API keys

1. The operator of the service creates an account with the admin key (`ADMIN_KEY`, default `admin-secret`).
2. The response contains the account's API key **once**. Only its SHA-256 hash is stored.
3. The calling application sends the key in the `x-api-key` header on every other request.
   A missing or unknown key gets `401`. The key decides which account the request belongs to.

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

## Product assumptions

- **Default plans:** an account created without `planId` gets **Starter**; a user gets **Basic**.
- **Plan assignment:** an account plan must have scope `account`, a user plan scope `user`, and the
  plan must be predefined or owned by the same account. Otherwise `400 invalid_plan`.
  Another account's plan gives the same error as a missing plan, so nothing leaks between accounts.
- **Isolation:** a user of another account is answered with `404`, exactly like a user that does not exist.
  The same `userId` may exist in two different accounts.
- **Creating accounts** needs a single admin key from the environment. There are no admin users or roles.

## TODO
- Plans API
- Rules and plan changes
- Retry behaviour (requestId)
- Product assumptions
- Design decisions
- Performance results
- Known limitations
