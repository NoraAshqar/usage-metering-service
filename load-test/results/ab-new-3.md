# Load test: ab-new-3

- Date: 2026-10-14T21:45:33.437Z
- 50 concurrent connections, 20 s per scenario, every request is POST /consume

| Scenario | Requests/s (avg) | p50 ms | p97.5 ms | p99 ms | Max ms | 2xx | Non-2xx | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| spread | 345 | 135 | 252 | 302 | 430 | 6896 | 0 | 0 |
| hot-account | 179 | 264 | 474 | 507 | 681 | 3571 | 0 | 0 |
| limit-reached | 202 | 219 | 462 | 517 | 545 | 4034 | 0 | 0 |

## Correctness after the load

**spread** (20 accounts x 5 users, requests spread over all of them): 6920 decisions, 6920 accepted, 38013 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**hot-account** (1 account x 50 users, every request hits the same account): 3573 decisions, 3573 accepted, 19693 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**limit-reached** (1 account limited to 5,000 units, 10 users, 10 units per request): 4036 decisions, 500 accepted, 5000 units used
(account limit: 5000 units)

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

