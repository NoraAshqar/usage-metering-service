import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { config } from '../src/config';
import { app, closeDatabase, createTestAccount, predefinedPlanId, setupDatabase } from './helpers';

before(setupDatabase);
after(closeDatabase);

describe('creating accounts (admin key)', () => {
  it('rejects a missing or wrong admin key', async () => {
    const missing = await request(app).post('/admin/accounts').send({ name: 'x' });
    assert.equal(missing.status, 401);

    const wrong = await request(app).post('/admin/accounts').set('x-admin-key', 'nope').send({ name: 'x' });
    assert.equal(wrong.status, 401);
  });

  it('creates an account on the Starter plan by default and returns an API key', async () => {
    const res = await request(app)
      .post('/admin/accounts')
      .set('x-admin-key', config.adminKey)
      .send({ name: 'Acme Docs' });

    assert.equal(res.status, 201);
    assert.match(res.body.apiKey, /^mk_/);
    assert.equal(res.body.account.name, 'Acme Docs');
    assert.equal(res.body.account.plan.name, 'Starter');
  });

  it('rejects a user plan as an account plan', async () => {
    const res = await request(app)
      .post('/admin/accounts')
      .set('x-admin-key', config.adminKey)
      .send({ name: 'x', planId: await predefinedPlanId('Basic') });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_plan');
  });

  it('validates the body', async () => {
    const res = await request(app).post('/admin/accounts').set('x-admin-key', config.adminKey).send({ name: '' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });
});

describe('API key validation', () => {
  it('rejects requests without an API key', async () => {
    const res = await request(app).get('/account');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'missing_api_key');
  });

  it('rejects an invalid API key', async () => {
    const res = await request(app).get('/account').set('x-api-key', 'mk_not_a_real_key');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'invalid_api_key');
  });

  it('returns the account that owns the key', async () => {
    const { apiKey, accountId } = await createTestAccount();
    const res = await request(app).get('/account').set('x-api-key', apiKey);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, accountId);
  });
});

describe('users', () => {
  it('registers a user on the Basic plan by default, and rejects duplicates', async () => {
    const { apiKey } = await createTestAccount();

    const created = await request(app).post('/users').set('x-api-key', apiKey).send({ userId: 'alice' });
    assert.equal(created.status, 201);
    assert.equal(created.body.userId, 'alice');
    assert.equal(created.body.plan.name, 'Basic');

    const duplicate = await request(app).post('/users').set('x-api-key', apiKey).send({ userId: 'alice' });
    assert.equal(duplicate.status, 409);
  });

  it('switches a user plan, but only to a user-scope plan', async () => {
    const { apiKey } = await createTestAccount();
    await request(app).post('/users').set('x-api-key', apiKey).send({ userId: 'alice' });

    const toPremium = await request(app)
      .put('/users/alice/plan')
      .set('x-api-key', apiKey)
      .send({ planId: await predefinedPlanId('Premium') });
    assert.equal(toPremium.status, 200);
    assert.equal(toPremium.body.plan.name, 'Premium');

    const toAccountPlan = await request(app)
      .put('/users/alice/plan')
      .set('x-api-key', apiKey)
      .send({ planId: await predefinedPlanId('Pro') });
    assert.equal(toAccountPlan.status, 400);
  });

  it('switches the account plan', async () => {
    const { apiKey } = await createTestAccount();
    const res = await request(app)
      .put('/account/plan')
      .set('x-api-key', apiKey)
      .send({ planId: await predefinedPlanId('Pro') });
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.name, 'Pro');
  });
});

describe('account isolation', () => {
  it("cannot see or change another account's users", async () => {
    const accountA = await createTestAccount();
    const accountB = await createTestAccount();
    await request(app).post('/users').set('x-api-key', accountA.apiKey).send({ userId: 'alice' });

    const read = await request(app).get('/users/alice').set('x-api-key', accountB.apiKey);
    assert.equal(read.status, 404);

    const change = await request(app)
      .put('/users/alice/plan')
      .set('x-api-key', accountB.apiKey)
      .send({ planId: await predefinedPlanId('Premium') });
    assert.equal(change.status, 404);
  });

  it('allows the same userId in two different accounts', async () => {
    const accountA = await createTestAccount();
    const accountB = await createTestAccount();

    const a = await request(app).post('/users').set('x-api-key', accountA.apiKey).send({ userId: 'bob' });
    const b = await request(app).post('/users').set('x-api-key', accountB.apiKey).send({ userId: 'bob' });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
  });
});
