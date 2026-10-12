// The heart of the project. Everything happens in ONE transaction (withTransaction).
// TODO (Day 4):
//   1. Find the user (must belong to this account) -> 404 if not.
//   2. Make sure usage rows exist for this month:
//        INSERT INTO account_usage ... ON CONFLICT DO NOTHING
//        INSERT INTO user_usage    ... ON CONFLICT DO NOTHING
//   3. LOCK the account row:  SELECT used FROM account_usage ... FOR UPDATE
//      (always account first, then user -> same order everywhere = no deadlocks)
//   4. Retry check: is there already a consume_requests row with this request_id?
//        same body  -> return the stored decision as it was (do NOT re-evaluate)
//        different  -> 409 conflict
//      This check MUST come after the lock in step 3: two requests with the same request_id
//      wait on the same account row, so the second one sees the first one's committed row.
//      (Checking before the lock would let both pass the check at the same time.)
//   5. LOCK the user row:  SELECT used FROM user_usage ... FOR UPDATE
//   6. Read the CURRENT account plan + user plan (so plan changes apply immediately).
//   7. evaluate(...) from rules.ts
//   8. If accepted: UPDATE account_usage / user_usage SET used = used + units
//   9. INSERT INTO consume_requests (the decision, accepted or not)
//  10. COMMIT and return the decision with remaining units.
export {};
