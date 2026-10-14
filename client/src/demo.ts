import { Decision, MeteringClient, Plan, createAccount } from './api';

let documentCount = 0;

function step(title: string) {
  console.log(`\n=== ${title}`);
}

function describePlan(plan: Plan) {
  return `${plan.name} (${plan.monthlyLimit}/month, max ${plan.maxUnitsPerRequest}/request)`;
}

function printDecision(decision: Decision) {
  const status = decision.accepted ? 'ACCEPTED' : 'REJECTED';
  const reason = decision.rejectedBy ? ` by the ${decision.rejectedBy.level} plan: ${decision.rejectedBy.rule}` : '';
  const retry = decision.replayed ? ' (retry: the original decision and its remaining values)' : '';
  console.log(`  ${status}${reason}${retry}`);
  console.log(`  remaining -> account: ${decision.remaining.account}, ${decision.userId}: ${decision.remaining.user}`);
}

async function processDocument(client: MeteringClient, userId: string, units: number, requestId?: string) {
  documentCount += 1;
  const id = requestId ?? `doc-${Date.now()}-${documentCount}`;
  console.log(`\n${userId} wants to process a document that costs ${units} units  [${id}]`);

  const decision = await client.consume(userId, units, id);
  printDecision(decision);
  if (decision.replayed) {
    console.log('  already processed earlier, nothing charged again');
  } else if (decision.accepted) {
    console.log('  ...document processed');
  }
  return decision;
}

async function printUsage(client: MeteringClient) {
  const usage = await client.usage();
  console.log(`\nUsage for ${usage.month}:`);
  const rows = [{ name: 'account', ...usage.account }, ...usage.users.map((user) => ({ name: user.userId, ...user }))];
  const table = Object.fromEntries(
    rows.map((row) => [row.name, { plan: row.plan.name, used: row.used, limit: row.monthlyLimit, remaining: row.remaining }]),
  );
  console.table(table);
}

async function main() {
  step('Setup: a document processing company with two users');
  const apiKey = await createAccount(`DocuCorp ${new Date().toISOString()}`);
  const client = new MeteringClient(apiKey);
  console.log(`Account created. API key: ${apiKey}`);

  const teamPlan = await client.createPlan({ name: 'Small Team', scope: 'account', monthlyLimit: 300, maxUnitsPerRequest: 100 });
  await client.setAccountPlan(teamPlan.id);
  const basic = await client.findPlan('Basic');
  const premium = await client.findPlan('Premium');
  await client.createUser('alice', basic.id);
  await client.createUser('bob', premium.id);
  console.log(`account plan: ${describePlan(teamPlan)}`);
  console.log(`alice:        ${describePlan(basic)}`);
  console.log(`bob:          ${describePlan(premium)}`);

  step('1. Accepted request');
  const first = await processDocument(client, 'alice', 10);

  step("2. Rejected by the user's plan (alice may use at most 20 units per request)");
  await processDocument(client, 'alice', 25);

  step("3. Rejected by the shared account plan (bob has plenty left, the account doesn't)");
  await processDocument(client, 'bob', 100);
  await processDocument(client, 'bob', 100);
  await processDocument(client, 'bob', 100);

  step('4. Switch alice to Premium: the same 25-unit request is now accepted');
  await client.setUserPlan('alice', premium.id);
  console.log(`alice is now on ${describePlan(premium)}`);
  await processDocument(client, 'alice', 25);

  step('5. Raise the account plan to 1000/month: bob can continue');
  const updated = await client.updatePlan(teamPlan.id, { monthlyLimit: 1000 });
  console.log(`account plan is now ${describePlan(updated)}`);
  await processDocument(client, 'bob', 100);

  step('6. Retry: the request from step 1 is sent again with the same requestId');
  await processDocument(client, 'alice', 10, first.requestId);

  step('Summary');
  await printUsage(client);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
