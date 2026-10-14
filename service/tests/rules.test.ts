import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluate, remaining } from '../src/services/rules';

const account = { monthlyLimit: 10_000, maxUnitsPerRequest: 100, used: 0 };
const user = { monthlyLimit: 1_000, maxUnitsPerRequest: 20, used: 0 };

describe('evaluate', () => {
  it('accepts a request that both plans allow', () => {
    assert.deepEqual(evaluate(10, account, user), { accepted: true });
  });

  it("rejects 25 units by the user's per-request limit, even with monthly units left", () => {
    assert.deepEqual(evaluate(25, account, user), { accepted: false, level: 'user', rule: 'max_units_per_request' });
  });

  it("rejects by the account's per-request limit", () => {
    const generousUser = { ...user, maxUnitsPerRequest: 500 };
    assert.deepEqual(evaluate(150, account, generousUser), {
      accepted: false,
      level: 'account',
      rule: 'max_units_per_request',
    });
  });

  it("rejects by the user's monthly allowance", () => {
    assert.deepEqual(evaluate(10, account, { ...user, used: 995 }), {
      accepted: false,
      level: 'user',
      rule: 'monthly_limit',
    });
  });

  it('rejects 10 units when the account has only 5 left, even if the user has plenty', () => {
    assert.deepEqual(evaluate(10, { ...account, used: 9_995 }, user), {
      accepted: false,
      level: 'account',
      rule: 'monthly_limit',
    });
  });

  it('accepts a request that uses exactly the last remaining units', () => {
    assert.deepEqual(evaluate(5, { ...account, used: 9_995 }, user), { accepted: true });
  });
});

describe('remaining', () => {
  it('is the limit minus what was used', () => {
    assert.equal(remaining(100, 30), 70);
  });

  it('is 0, not negative, when the limit was reduced below usage', () => {
    assert.equal(remaining(10, 25), 0);
  });
});
