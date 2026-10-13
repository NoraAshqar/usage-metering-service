import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { consume } from '../src/services/consume.service';
import {
  app,
  closeDatabase,
  consumeUnits,
  createTestAccount,
  newRequestId,
  setupAccount,
  setupDatabase,
} from './helpers';

before(setupDatabase);
after(closeDatabase);

// The example from the brief.
const accountPlan = { monthlyLimit: 10_000, maxUnitsPerRequest: 100 };
const userPlan = { monthlyLimit: 1_000, maxUnitsPerRequest: 20 };

describe('consume: the examples from the brief', () => {
  it('accepts 10 units and counts them for both the user and the account', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan });

    const res = await consumeUnits(apiKey, 'alice', 10);
    assert.equal(res.status, 200);
    assert.equal(res.body.accepted, true);
    assert.equal(res.body.rejectedBy, null);
    assert.deepEqual(res.body.remaining, { account: 9_990, user: 990 });
    assert.equal(res.body.replayed, false);
  });

  it("rejects 25 units by the user's per-request limit", async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan });

    const res = await consumeUnits(apiKey, 'alice', 25);
    assert.equal(res.status, 200);
    assert.equal(res.body.accepted, false);
    assert.deepEqual(res.body.rejectedBy, { level: 'user', rule: 'max_units_per_request' });
    assert.deepEqual(res.body.remaining, { account: 10_000, user: 1_000 }); // nothing consumed
  });

  it('rejects 10 units when the account has only 5 left, even if the user has plenty', async () => {
    const { apiKey } = await setupAccount(
      { monthlyLimit: 15, maxUnitsPerRequest: 100 },
      { alice: userPlan, bob: userPlan },
    );
    await consumeUnits(apiKey, 'alice', 10); // account: 5 left

    const res = await consumeUnits(apiKey, 'bob', 10);
    assert.equal(res.body.accepted, false);
    assert.deepEqual(res.body.rejectedBy, { level: 'account', rule: 'monthly_limit' });
    assert.deepEqual(res.body.remaining, { account: 5, user: 1_000 });
  });
});

describe('consume: accounting', () => {
  it("the account's usage is the sum of its users' usage; users don't share allowances", async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan, bob: userPlan });

    await consumeUnits(apiKey, 'alice', 20);
    const res = await consumeUnits(apiKey, 'bob', 15);
    assert.deepEqual(res.body.remaining, { account: 10_000 - 35, user: 1_000 - 15 });
  });

  it("rejects by the user's monthly allowance", async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: { monthlyLimit: 30, maxUnitsPerRequest: 20 } });
    await consumeUnits(apiKey, 'alice', 20);

    const res = await consumeUnits(apiKey, 'alice', 15);
    assert.deepEqual(res.body.rejectedBy, { level: 'user', rule: 'monthly_limit' });
    assert.deepEqual(res.body.remaining, { account: 9_980, user: 10 });
  });

  it('accepts a request that uses exactly the last units, then rejects the next one', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: { monthlyLimit: 20, maxUnitsPerRequest: 20 } });

    assert.equal((await consumeUnits(apiKey, 'alice', 20)).body.accepted, true);
    assert.equal((await consumeUnits(apiKey, 'alice', 1)).body.accepted, false);
  });

  it('starts every UTC month at zero and keeps previous months', async () => {
    const { accountId } = await setupAccount(accountPlan, { alice: { monthlyLimit: 20, maxUnitsPerRequest: 20 } });

    const january = await consume(accountId, { userId: 'alice', units: 20, requestId: newRequestId() }, new Date('2025-01-31T23:59:59Z'));
    const february = await consume(accountId, { userId: 'alice', units: 20, requestId: newRequestId() }, new Date('2025-02-01T00:00:00Z'));

    assert.equal(january.month, '2025-01');
    assert.equal(february.month, '2025-02');
    assert.equal(february.accepted, true);
    assert.equal(february.remaining.user, 0);
  });
});

describe('consume: plan changes', () => {
  it('a plan update applies to the next request', async () => {
    const { apiKey, userPlanIds } = await setupAccount(accountPlan, { alice: userPlan });
    assert.equal((await consumeUnits(apiKey, 'alice', 25)).body.accepted, false);

    await request(app).patch(`/plans/${userPlanIds.alice}`).set('x-api-key', apiKey).send({ maxUnitsPerRequest: 50 });

    assert.equal((await consumeUnits(apiKey, 'alice', 25)).body.accepted, true);
  });

  it('switching plans keeps the units already used (no fresh allowance)', async () => {
    const { apiKey } = await setupAccount(accountPlan, {
      alice: { monthlyLimit: 30, maxUnitsPerRequest: 20 },
      bigger: { monthlyLimit: 40, maxUnitsPerRequest: 20 }, // only used for its plan
    });
    await consumeUnits(apiKey, 'alice', 20);

    const biggerPlanId = (await request(app).get('/users/bigger').set('x-api-key', apiKey)).body.plan.id;
    await request(app).put('/users/alice/plan').set('x-api-key', apiKey).send({ planId: biggerPlanId });

    const res = await consumeUnits(apiKey, 'alice', 5);
    assert.equal(res.body.remaining.user, 40 - 25); // 20 used before the switch still count
  });

  it('a limit reduced below usage shows 0 remaining and rejects further requests', async () => {
    const { apiKey, userPlanIds } = await setupAccount(accountPlan, { alice: { monthlyLimit: 30, maxUnitsPerRequest: 20 } });
    await consumeUnits(apiKey, 'alice', 20);

    await request(app).patch(`/plans/${userPlanIds.alice}`).set('x-api-key', apiKey).send({ monthlyLimit: 10 });

    const res = await consumeUnits(apiKey, 'alice', 1);
    assert.equal(res.body.accepted, false);
    assert.deepEqual(res.body.rejectedBy, { level: 'user', rule: 'monthly_limit' });
    assert.equal(res.body.remaining.user, 0);
  });
});

describe('consume: retries (requestId)', () => {
  it('a retry returns the original decision and does not consume again', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan });
    const requestId = newRequestId();

    const first = await consumeUnits(apiKey, 'alice', 10, requestId);
    const retry = await consumeUnits(apiKey, 'alice', 10, requestId);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
    assert.equal(retry.body.accepted, true);
    assert.deepEqual(retry.body.remaining, first.body.remaining);

    const next = await consumeUnits(apiKey, 'alice', 1);
    assert.deepEqual(next.body.remaining, { account: 9_989, user: 989 }); // 10 counted once
  });

  it('a retried rejection stays rejected, even after the plan changed', async () => {
    const { apiKey, userPlanIds } = await setupAccount(accountPlan, { alice: userPlan });
    const requestId = newRequestId();
    await consumeUnits(apiKey, 'alice', 25, requestId);

    await request(app).patch(`/plans/${userPlanIds.alice}`).set('x-api-key', apiKey).send({ maxUnitsPerRequest: 50 });

    const retry = await consumeUnits(apiKey, 'alice', 25, requestId);
    assert.equal(retry.body.accepted, false);
    assert.equal(retry.body.replayed, true);
  });

  it('reusing a requestId for a different request is a 409', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan, bob: userPlan });
    const requestId = newRequestId();
    await consumeUnits(apiKey, 'alice', 10, requestId);

    const otherUnits = await consumeUnits(apiKey, 'alice', 11, requestId);
    const otherUser = await consumeUnits(apiKey, 'bob', 10, requestId);
    assert.equal(otherUnits.status, 409);
    assert.equal(otherUser.status, 409);
    assert.equal(otherUnits.body.error.code, 'request_id_conflict');
  });

  it('the same requestId in two different accounts are two different requests', async () => {
    const a = await setupAccount(accountPlan, { alice: userPlan });
    const b = await setupAccount(accountPlan, { alice: userPlan });
    const requestId = newRequestId();

    assert.equal((await consumeUnits(a.apiKey, 'alice', 10, requestId)).body.replayed, false);
    assert.equal((await consumeUnits(b.apiKey, 'alice', 10, requestId)).body.replayed, false);
  });
});

describe('consume: errors', () => {
  it('rejects invalid input', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan });

    for (const units of [0, -5, 1.5, '10', undefined]) {
      const res = await request(app).post('/consume').set('x-api-key', apiKey).send({ userId: 'alice', units, requestId: newRequestId() });
      assert.equal(res.status, 400, `units=${units}`);
    }
    const noRequestId = await request(app).post('/consume').set('x-api-key', apiKey).send({ userId: 'alice', units: 1 });
    assert.equal(noRequestId.status, 400);
  });

  it("returns 404 for an unknown user and for another account's user", async () => {
    const owner = await setupAccount(accountPlan, { alice: userPlan });
    const other = await createTestAccount();

    assert.equal((await consumeUnits(owner.apiKey, 'nobody', 1)).status, 404);
    assert.equal((await consumeUnits(other.apiKey, 'alice', 1)).status, 404);
  });

  it('requires an API key', async () => {
    const res = await request(app).post('/consume').send({ userId: 'alice', units: 1, requestId: 'x' });
    assert.equal(res.status, 401);
  });
});
