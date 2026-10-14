import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db';
import { closeDatabase, consumeUnits, newRequestId, setupAccount, setupDatabase } from './helpers';

before(setupDatabase);
after(closeDatabase);

async function assertTotalsMatchHistory(accountId: number) {
  const usage = await pool.query('SELECT COALESCE(SUM(used), 0)::int AS used FROM account_usage WHERE account_id = $1', [accountId]);
  const users = await pool.query(
    'SELECT COALESCE(SUM(uu.used), 0)::int AS used FROM user_usage uu JOIN users u ON u.id = uu.user_id WHERE u.account_id = $1',
    [accountId],
  );
  const history = await pool.query(
    'SELECT COALESCE(SUM(units), 0)::int AS used FROM consume_requests WHERE account_id = $1 AND accepted',
    [accountId],
  );
  assert.equal(usage.rows[0].used, history.rows[0].used, 'account counter = accepted history');
  assert.equal(users.rows[0].used, history.rows[0].used, 'sum of user counters = accepted history');
  return usage.rows[0].used as number;
}

describe('concurrency', () => {
  it("50 parallel requests never exceed a user's monthly allowance", async () => {
    const { apiKey, accountId } = await setupAccount(
      { monthlyLimit: 100_000, maxUnitsPerRequest: 100 },
      { alice: { monthlyLimit: 100, maxUnitsPerRequest: 10 } },
    );

    const responses = await Promise.all(Array.from({ length: 50 }, () => consumeUnits(apiKey, 'alice', 10)));

    const accepted = responses.filter((r) => r.body.accepted);
    assert.ok(responses.every((r) => r.status === 200));
    assert.equal(accepted.length, 10);
    assert.equal(await assertTotalsMatchHistory(accountId), 100);
  });

  it("parallel requests from many users never exceed the shared account allowance", async () => {
    const generous = { monthlyLimit: 1_000, maxUnitsPerRequest: 100 };
    const { apiKey, accountId } = await setupAccount(
      { monthlyLimit: 100, maxUnitsPerRequest: 100 },
      { u1: generous, u2: generous, u3: generous, u4: generous, u5: generous },
    );

    const requests = [];
    for (let i = 0; i < 40; i++) requests.push(consumeUnits(apiKey, `u${(i % 5) + 1}`, 5));
    const responses = await Promise.all(requests);

    const accepted = responses.filter((r) => r.body.accepted);
    const rejected = responses.filter((r) => !r.body.accepted);
    assert.equal(accepted.length, 20);
    assert.ok(rejected.every((r) => r.body.rejectedBy.level === 'account'));
    assert.equal(await assertTotalsMatchHistory(accountId), 100);
  });

  it('the same requestId sent 10 times at once is consumed exactly once', async () => {
    const { apiKey, accountId } = await setupAccount(
      { monthlyLimit: 10_000, maxUnitsPerRequest: 100 },
      { alice: { monthlyLimit: 1_000, maxUnitsPerRequest: 20 } },
    );
    const requestId = newRequestId();

    const responses = await Promise.all(Array.from({ length: 10 }, () => consumeUnits(apiKey, 'alice', 10, requestId)));

    assert.ok(responses.every((r) => r.status === 200 && r.body.accepted));
    assert.equal(responses.filter((r) => !r.body.replayed).length, 1);
    assert.equal(await assertTotalsMatchHistory(accountId), 10);
  });
});
