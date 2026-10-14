# Load test: ab-old-3

- Date: 2026-10-14T21:44:19.957Z
- 50 concurrent connections, 20 s per scenario, every request is POST /consume

| Scenario | Requests/s (avg) | p50 ms | p97.5 ms | p99 ms | Max ms | 2xx | Non-2xx | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| spread | 278 | 169 | 287 | 325 | 560 | 5565 | 0 | 0 |
| hot-account | 141 | 342 | 494 | 624 | 669 | 2812 | 0 | 0 |
| limit-reached | 147 | 318 | 556 | 593 | 636 | 2945 | 0 | 0 |

## Correctness after the load

**spread** (20 accounts x 5 users, requests spread over all of them): 5582 decisions, 5582 accepted, 30663 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**hot-account** (1 account x 50 users, every request hits the same account): 2813 decisions, 2813 accepted, 15403 units used

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

**limit-reached** (1 account limited to 5,000 units, 10 users, 10 units per request): 2949 decisions, 500 accepted, 5000 units used
(account limit: 5000 units)

- PASS account counter = accepted units in history
- PASS sum of user counters = account counter
- PASS account usage <= monthly limit
- PASS every 2xx response has a stored decision

