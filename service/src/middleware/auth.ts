// API key middleware.
// TODO (Day 2):
//   1. Read the `x-api-key` header. Missing -> 401.
//   2. sha256 it and look up `accounts.api_key_hash`. Not found -> 401.
//   3. Save the account id on `res.locals.accountId` so every route knows WHO is calling.
//
// adminAuth: checks `x-admin-key` against config.adminKey (only used to create accounts).
export {};
