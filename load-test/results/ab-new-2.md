# Load test: ab-new-2

- Date: 2026-10-14T21:43:05.532Z
- 50 concurrent connections, 20 s per scenario, every request is POST /consume

| Scenario | Requests/s (avg) | p50 ms | p97.5 ms | p99 ms | Max ms | 2xx | Non-2xx | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| spread | 225 | 182 | 533 | 626 | 841 | 4507 | 0 | 0 |
| hot-account | 127 | 381 | 780 | 930 | 1005 | 2538 | 0 | 0 |
| limit-reached | 164 | 285 | 500 | 538 | 566 | 3287 | 0 | 0 |

## Correctness after the load

**spread** (20 accounts x 5 users, requests spread over all of them): 4537 decisions, 4537 accepted, 24703 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**hot-account** (1 account x 50 users, every request hits the same account): 2540 decisions, 2540 accepted, 13761 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**limit-reached** (1 account limited to 5,000 units, 10 users, 10 units per request): 3288 decisions, 500 accepted, 5000 units used
(account limit: 5000 units)

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

