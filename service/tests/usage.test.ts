import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { consume } from '../src/services/consume.service';
import { app, closeDatabase, consumeUnits, createTestAccount, newRequestId, setupAccount, setupDatabase } from './helpers';

before(setupDatabase);
after(closeDatabase);

const accountPlan = { monthlyLimit: 10_000, maxUnitsPerRequest: 100 };
const userPlan = { monthlyLimit: 1_000, maxUnitsPerRequest: 20 };

describe('GET /usage', () => {
  it("shows the account's and every user's used and remaining units", async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan, bob: userPlan, carol: userPlan });
    await consumeUnits(apiKey, 'alice', 20);
    await consumeUnits(apiKey, 'bob', 15);
    await consumeUnits(apiKey, 'bob', 25);

    const res = await request(app).get('/usage').set('x-api-key', apiKey);
    assert.equal(res.status, 200);
    assert.equal(res.body.account.used, 35);
    assert.equal(res.body.account.remaining, 10_000 - 35);
    assert.equal(res.body.account.monthlyLimit, 10_000);

    const byUser = Object.fromEntries(res.body.users.map((u: { userId: string; used: number }) => [u.userId, u.used]));
    assert.deepEqual(byUser, { alice: 20, bob: 15, carol: 0 });
    assert.equal(res.body.nextOffset, null);
  });

  it('shows a previous month, and an empty month as 0', async () => {
    const { apiKey, accountId } = await setupAccount(accountPlan, { alice: userPlan });
    await consume(accountId, { userId: 'alice', units: 7, requestId: newRequestId() }, new Date('2025-03-15T12:00:00Z'));

    const march = await request(app).get('/usage?month=2025-03').set('x-api-key', apiKey);
    const april = await request(app).get('/usage?month=2025-04').set('x-api-key', apiKey);
    assert.equal(march.body.month, '2025-03');
    assert.equal(march.body.account.used, 7);
    assert.equal(april.body.account.used, 0);
  });

  it('shows 0 remaining (not negative) after a limit is reduced below usage', async () => {
    const { apiKey, userPlanIds } = await setupAccount(accountPlan, { alice: userPlan });
    await consumeUnits(apiKey, 'alice', 20);
    await request(app).patch(`/plans/${userPlanIds.alice}`).set('x-api-key', apiKey).send({ monthlyLimit: 5 });

    const res = await request(app).get('/users/alice/usage').set('x-api-key', apiKey);
    assert.equal(res.body.user.used, 20);
    assert.equal(res.body.user.remaining, 0);
  });

  it('pages through users', async () => {
    const { apiKey } = await setupAccount(accountPlan, { u1: userPlan, u2: userPlan, u3: userPlan });

    const first = await request(app).get('/usage?limit=2').set('x-api-key', apiKey);
    assert.deepEqual(first.body.users.map((u: { userId: string }) => u.userId), ['u1', 'u2']);
    assert.equal(first.body.nextOffset, 2);

    const second = await request(app).get('/usage?limit=2&offset=2').set('x-api-key', apiKey);
    assert.deepEqual(second.body.users.map((u: { userId: string }) => u.userId), ['u3']);
    assert.equal(second.body.nextOffset, null);
  });

  it('rejects an invalid month or limit', async () => {
    const { apiKey } = await createTestAccount();
    for (const query of ['month=2026-13', 'month=October', 'limit=0', 'limit=101', 'offset=-1']) {
      const res = await request(app).get(`/usage?${query}`).set('x-api-key', apiKey);
      assert.equal(res.status, 400, query);
    }
  });
});

describe('GET /users/:userId/usage', () => {
  it("shows the user's and the account's usage", async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan, bob: userPlan });
    await consumeUnits(apiKey, 'alice', 10);
    await consumeUnits(apiKey, 'bob', 5);

    const res = await request(app).get('/users/alice/usage').set('x-api-key', apiKey);
    assert.equal(res.status, 200);
    assert.equal(res.body.userId, 'alice');
    assert.equal(res.body.user.used, 10);
    assert.equal(res.body.user.remaining, 990);
    assert.equal(res.body.account.used, 15);
  });

  it("returns 404 for another account's user", async () => {
    const owner = await setupAccount(accountPlan, { alice: userPlan });
    const other = await createTestAccount();
    await consumeUnits(owner.apiKey, 'alice', 10);

    const res = await request(app).get('/users/alice/usage').set('x-api-key', other.apiKey);
    assert.equal(res.status, 404);
  });
});

describe('GET /requests', () => {
  it('lists accepted and rejected requests, newest first, with the reason', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan });
    await consumeUnits(apiKey, 'alice', 10, 'first');
    await consumeUnits(apiKey, 'alice', 25, 'second');

    const res = await request(app).get('/requests').set('x-api-key', apiKey);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.requests.map((r: { requestId: string }) => r.requestId), ['second', 'first']);
    assert.deepEqual(res.body.requests[0].rejectedBy, { level: 'user', rule: 'max_units_per_request' });
    assert.equal(res.body.requests[1].accepted, true);
    assert.deepEqual(res.body.requests[1].remaining, { account: 9_990, user: 990 });
  });

  it('a retry does not add a second history entry', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan });
    await consumeUnits(apiKey, 'alice', 10, 'same');
    await consumeUnits(apiKey, 'alice', 10, 'same');

    const res = await request(app).get('/requests').set('x-api-key', apiKey);
    assert.equal(res.body.requests.length, 1);
  });

  it('filters by user and by month', async () => {
    const { apiKey, accountId } = await setupAccount(accountPlan, { alice: userPlan, bob: userPlan });
    await consumeUnits(apiKey, 'alice', 1, 'a-now');
    await consumeUnits(apiKey, 'bob', 1, 'b-now');
    await consume(accountId, { userId: 'alice', units: 1, requestId: 'a-old' }, new Date('2025-03-15T12:00:00Z'));

    const alice = await request(app).get('/requests?userId=alice').set('x-api-key', apiKey);
    assert.deepEqual(alice.body.requests.map((r: { requestId: string }) => r.requestId).sort(), ['a-now', 'a-old']);

    const march = await request(app).get('/requests?month=2025-03').set('x-api-key', apiKey);
    assert.deepEqual(march.body.requests.map((r: { requestId: string }) => r.requestId), ['a-old']);
  });

  it('pages through the history', async () => {
    const { apiKey } = await setupAccount(accountPlan, { alice: userPlan });
    for (const id of ['r1', 'r2', 'r3']) await consumeUnits(apiKey, 'alice', 1, id);

    const first = await request(app).get('/requests?limit=2').set('x-api-key', apiKey);
    assert.deepEqual(first.body.requests.map((r: { requestId: string }) => r.requestId), ['r3', 'r2']);
    assert.equal(first.body.nextOffset, 2);

    const second = await request(app).get('/requests?limit=2&offset=2').set('x-api-key', apiKey);
    assert.deepEqual(second.body.requests.map((r: { requestId: string }) => r.requestId), ['r1']);
    assert.equal(second.body.nextOffset, null);
  });

  it("never shows another account's requests", async () => {
    const a = await setupAccount(accountPlan, { alice: userPlan });
    const b = await setupAccount(accountPlan, { alice: userPlan });
    await consumeUnits(a.apiKey, 'alice', 1);

    const res = await request(app).get('/requests').set('x-api-key', b.apiKey);
    assert.deepEqual(res.body.requests, []);

    const otherUser = await request(app).get('/requests?userId=nobody').set('x-api-key', b.apiKey);
    assert.equal(otherUser.status, 404);
  });
});
