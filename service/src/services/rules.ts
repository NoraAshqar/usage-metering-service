// Pure rule evaluation - NO database here, so it is easy to unit-test.
// TODO (Day 4):
//   evaluate({ units, accountPlan, userPlan, accountUsed, userUsed })
//     -> { accepted: true }
//      | { accepted: false, level: 'account' | 'user', rule: 'max_units_per_request' | 'monthly_limit' }
//
//   Check order (the first failing rule is reported):
//     1. user    max_units_per_request
//     2. account max_units_per_request
//     3. user    monthly_limit
//     4. account monthly_limit
//
//   remaining(limit, used) = Math.max(0, limit - used)   // never negative, even after a plan downgrade
export {};
