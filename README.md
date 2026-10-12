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

## TODO
- API reference
- Account / user model and API keys
- Rules and plan changes
- Retry behaviour (requestId)
- Product assumptions
- Design decisions
- Performance results
- Known limitations
