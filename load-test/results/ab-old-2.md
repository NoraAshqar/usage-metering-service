# Load test: ab-old-2

- Date: 2026-10-14T21:41:50.818Z
- 50 concurrent connections, 20 s per scenario, every request is POST /consume

| Scenario | Requests/s (avg) | p50 ms | p97.5 ms | p99 ms | Max ms | 2xx | Non-2xx | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| spread | 241 | 194 | 349 | 395 | 513 | 4813 | 0 | 0 |
| hot-account | 120 | 377 | 1034 | 1187 | 1385 | 2403 | 0 | 0 |
| limit-reached | 143 | 332 | 571 | 616 | 641 | 2860 | 0 | 0 |

## Correctness after the load

**spread** (20 accounts x 5 users, requests spread over all of them): 4836 decisions, 4836 accepted, 26754 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**hot-account** (1 account x 50 users, every request hits the same account): 2405 decisions, 2405 accepted, 13024 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**limit-reached** (1 account limited to 5,000 units, 10 users, 10 units per request): 2861 decisions, 500 accepted, 5000 units used
(account limit: 5000 units)

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

