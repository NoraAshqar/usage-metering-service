# Load test: ab-old-1

- Date: 2026-10-14T21:39:21.354Z
- 50 concurrent connections, 20 s per scenario, every request is POST /consume

| Scenario | Requests/s (avg) | p50 ms | p97.5 ms | p99 ms | Max ms | 2xx | Non-2xx | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| spread | 269 | 174 | 303 | 342 | 519 | 5388 | 0 | 0 |
| hot-account | 113 | 409 | 725 | 832 | 867 | 2260 | 0 | 0 |
| limit-reached | 150 | 313 | 534 | 564 | 593 | 2999 | 0 | 0 |

## Correctness after the load

**spread** (20 accounts x 5 users, requests spread over all of them): 5404 decisions, 5404 accepted, 29784 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**hot-account** (1 account x 50 users, every request hits the same account): 2262 decisions, 2262 accepted, 12621 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**limit-reached** (1 account limited to 5,000 units, 10 users, 10 units per request): 3003 decisions, 500 accepted, 5000 units used
(account limit: 5000 units)

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

