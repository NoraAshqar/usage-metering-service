import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app, closeDatabase, createTestAccount, predefinedPlanId, setupDatabase } from './helpers';

before(setupDatabase);
after(closeDatabase);

const goldPlan = { name: 'Gold', scope: 'user', monthlyLimit: 2000, maxUnitsPerRequest: 50 };

async function createPlan(apiKey: string, plan: object = goldPlan) {
  return request(app).post('/plans').set('x-api-key', apiKey).send(plan);
}

describe('listing plans', () => {
  it('shows the 4 predefined plans and my own plans, but not other accounts\' plans', async () => {
    const mine = await createTestAccount();
    const other = await createTestAccount();
    await createPlan(mine.apiKey, { ...goldPlan, name: 'Mine' });
    await createPlan(other.apiKey, { ...goldPlan, name: 'Theirs' });

    const res = await request(app).get('/plans').set('x-api-key', mine.apiKey);
    assert.equal(res.status, 200);
    const names = res.body.plans.map((p: { name: string }) => p.name);
    assert.deepEqual(names, ['Starter', 'Pro', 'Basic', 'Premium', 'Mine']);
  });
});

describe('custom plans', () => {
  it('creates a custom plan', async () => {
    const { apiKey } = await createTestAccount();
    const res = await createPlan(apiKey);

    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Gold');
    assert.equal(res.body.scope, 'user');
    assert.equal(res.body.monthlyLimit, 2000);
    assert.equal(res.body.maxUnitsPerRequest, 50);
    assert.equal(res.body.predefined, false);
  });

  it('validates the body', async () => {
    const { apiKey } = await createTestAccount();
    const badScope = await createPlan(apiKey, { ...goldPlan, scope: 'team' });
    const zeroPerRequest = await createPlan(apiKey, { ...goldPlan, maxUnitsPerRequest: 0 });
    const decimal = await createPlan(apiKey, { ...goldPlan, monthlyLimit: 10.5 });
    const tooBig = await createPlan(apiKey, { ...goldPlan, monthlyLimit: 1e12 });

    for (const res of [badScope, zeroPerRequest, decimal, tooBig]) {
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'validation_error');
    }
  });

  it('rejects a duplicate name with the same scope, allows it in another account', async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await createPlan(a.apiKey);

    assert.equal((await createPlan(a.apiKey)).status, 409);
    assert.equal((await createPlan(a.apiKey, { ...goldPlan, scope: 'account' })).status, 201);
    assert.equal((await createPlan(b.apiKey)).status, 201);
  });

  it('updates only the fields that are sent', async () => {
    const { apiKey } = await createTestAccount();
    const plan = (await createPlan(apiKey)).body;

    const res = await request(app).patch(`/plans/${plan.id}`).set('x-api-key', apiKey).send({ monthlyLimit: 300 });
    assert.equal(res.status, 200);
    assert.equal(res.body.monthlyLimit, 300);
    assert.equal(res.body.maxUnitsPerRequest, 50);
    assert.equal(res.body.name, 'Gold');
  });

  it('does not allow changing the scope or sending an empty update', async () => {
    const { apiKey } = await createTestAccount();
    const plan = (await createPlan(apiKey)).body;

    const scope = await request(app).patch(`/plans/${plan.id}`).set('x-api-key', apiKey).send({ scope: 'account' });
    const empty = await request(app).patch(`/plans/${plan.id}`).set('x-api-key', apiKey).send({});
    assert.equal(scope.status, 400);
    assert.equal(empty.status, 400);
  });

  it('keeps predefined plans read-only', async () => {
    const { apiKey } = await createTestAccount();
    const res = await request(app)
      .patch(`/plans/${await predefinedPlanId('Basic')}`)
      .set('x-api-key', apiKey)
      .send({ monthlyLimit: 999999 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'plan_read_only');
  });
});

describe('assigning custom plans', () => {
  it('several users share one plan, and an update is visible to all of them', async () => {
    const { apiKey } = await createTestAccount();
    const plan = (await createPlan(apiKey)).body;
    await request(app).post('/users').set('x-api-key', apiKey).send({ userId: 'alice', planId: plan.id });
    await request(app).post('/users').set('x-api-key', apiKey).send({ userId: 'bob', planId: plan.id });

    await request(app).patch(`/plans/${plan.id}`).set('x-api-key', apiKey).send({ maxUnitsPerRequest: 75 });

    for (const userId of ['alice', 'bob']) {
      const user = await request(app).get(`/users/${userId}`).set('x-api-key', apiKey);
      assert.equal(user.body.plan.id, plan.id);
      assert.equal(user.body.plan.maxUnitsPerRequest, 75);
    }
  });

  it('assigns an account-scope custom plan to the account', async () => {
    const { apiKey } = await createTestAccount();
    const plan = (await createPlan(apiKey, { ...goldPlan, scope: 'account' })).body;

    const res = await request(app).put('/account/plan').set('x-api-key', apiKey).send({ planId: plan.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.id, plan.id);
  });
});

describe('plan isolation', () => {
  it("cannot read, update or assign another account's plan", async () => {
    const owner = await createTestAccount();
    const other = await createTestAccount();
    const plan = (await createPlan(owner.apiKey)).body;

    const read = await request(app).get(`/plans/${plan.id}`).set('x-api-key', other.apiKey);
    assert.equal(read.status, 404);

    const update = await request(app).patch(`/plans/${plan.id}`).set('x-api-key', other.apiKey).send({ monthlyLimit: 1 });
    assert.equal(update.status, 404);

    const assign = await request(app).post('/users').set('x-api-key', other.apiKey).send({ userId: 'eve', planId: plan.id });
    assert.equal(assign.status, 400);
    assert.equal(assign.body.error.code, 'invalid_plan');

    // The owner's plan was not changed.
    const ownerView = await request(app).get(`/plans/${plan.id}`).set('x-api-key', owner.apiKey);
    assert.equal(ownerView.body.monthlyLimit, 2000);
  });

  it('rejects a non-numeric plan id', async () => {
    const { apiKey } = await createTestAccount();
    const res = await request(app).get('/plans/abc').set('x-api-key', apiKey);
    assert.equal(res.status, 400);
  });
});
