Load test (Day 8) - uses `autocannon` (npm, no install needed with npx).

Plan:
1. `setup.ts`  -> create an account + N users through the API, save the API key.
2. Run: `npx autocannon -c 50 -d 20 -m POST ...` against `POST /consume`
   (each request gets a unique requestId).
3. Afterwards check correctness in SQL:
   account_usage.used == SUM(units) of accepted rows in consume_requests, and never > monthly_limit.
4. Save the output in `results/` and write what we learned in the main README.
