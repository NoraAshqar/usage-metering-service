// Command-line demo: a fake "document processing app" that calls the metering service.
// Uses Node's built-in fetch, no extra libraries.
//
// TODO (Day 7) - scenario printed step by step:
//   1. Create an account (admin key) on the Starter plan -> get its API key.
//   2. Register 2 users: alice (Basic), bob (Premium).
//   3. alice processes 10 units          -> ACCEPTED
//   4. alice processes 25 units          -> REJECTED (user max_units_per_request)
//   5. bob uses up most of the account allowance, then one more request
//                                         -> REJECTED (account monthly_limit)
//   6. Switch alice to Premium (or update a custom plan) and retry the 25-unit request
//                                         -> ACCEPTED, same client code
//   After each step print: decision, reason, account remaining, user remaining.

const SERVICE_URL = process.env.SERVICE_URL ?? 'http://localhost:3000';

async function main() {
  const res = await fetch(`${SERVICE_URL}/health`);
  console.log('Service health:', await res.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
