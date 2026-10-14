import autocannon from 'autocannon';
import fs from 'node:fs';
import pg from 'pg';

const SERVICE_URL = process.env.SERVICE_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'admin-secret';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://metering:metering@localhost:5432/metering';
const DURATION = Number(process.env.DURATION ?? 15);
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 50);
const LABEL = process.env.LABEL ?? 'run';

const big = { monthlyLimit: 100_000_000, maxUnitsPerRequest: 100 };

const scenarios = [
  {
    name: 'spread',
    description: '20 accounts x 5 users, requests spread over all of them',
    accounts: 20,
    usersPerAccount: 5,
    accountPlan: big,
    userPlan: big,
    units: () => 1 + Math.floor(Math.random() * 10),
  },
  {
    name: 'hot-account',
    description: '1 account x 50 users, every request hits the same account',
    accounts: 1,
    usersPerAccount: 50,
    accountPlan: big,
    userPlan: big,
    units: () => 1 + Math.floor(Math.random() * 10),
  },
  {
    name: 'limit-reached',
    description: '1 account limited to 5,000 units, 10 users, 10 units per request',
    accounts: 1,
    usersPerAccount: 10,
    accountPlan: { monthlyLimit: 5_000, maxUnitsPerRequest: 100 },
    userPlan: big,
    units: () => 10,
  },
];

async function call(method, path, headers, body) {
  const res = await fetch(`${SERVICE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}: ${data.error?.message}`);
  return data;
}

async function createAccount(scenario, index) {
  const { apiKey, account } = await call('POST', '/admin/accounts', { 'x-admin-key': ADMIN_KEY }, {
    name: `load ${LABEL} ${scenario.name} ${index}`,
  });
  const auth = { 'x-api-key': apiKey };
  const accountPlan = await call('POST', '/plans', auth, { name: 'load account', scope: 'account', ...scenario.accountPlan });
  await call('PUT', '/account/plan', auth, { planId: accountPlan.id });
  const userPlan = await call('POST', '/plans', auth, { name: 'load user', scope: 'user', ...scenario.userPlan });

  const userIds = [];
  for (let i = 0; i < scenario.usersPerAccount; i++) {
    const userId = `user-${i}`;
    await call('POST', '/users', auth, { userId, planId: userPlan.id });
    userIds.push(userId);
  }
  return { id: account.id, apiKey, userIds };
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function runScenario(scenario) {
  const accounts = [];
  for (let i = 0; i < scenario.accounts; i++) accounts.push(await createAccount(scenario, i));

  let counter = 0;
  const result = await autocannon({
    url: `${SERVICE_URL}/consume`,
    connections: CONNECTIONS,
    duration: DURATION,
    requests: [
      {
        method: 'POST',
        setupRequest: (request) => {
          const account = pick(accounts);
          counter += 1;
          return {
            ...request,
            headers: { 'content-type': 'application/json', 'x-api-key': account.apiKey },
            body: JSON.stringify({
              userId: pick(account.userIds),
              units: scenario.units(),
              requestId: `${LABEL}-${scenario.name}-${counter}`,
            }),
          };
        },
      },
    ],
  });

  return { scenario, accounts, result };
}

async function checkCorrectness(db, { scenario, accounts, result }) {
  const accountIds = accounts.map((a) => a.id);
  const totals = await db.query(
    `SELECT a.id,
            p.monthly_limit,
            COALESCE((SELECT SUM(used) FROM account_usage au WHERE au.account_id = a.id), 0)::int AS account_used,
            COALESCE((SELECT SUM(uu.used) FROM user_usage uu JOIN users u ON u.id = uu.user_id
                      WHERE u.account_id = a.id), 0)::int AS users_used,
            COALESCE((SELECT SUM(units) FROM consume_requests cr
                      WHERE cr.account_id = a.id AND cr.accepted), 0)::int AS accepted_units,
            (SELECT COUNT(*) FROM consume_requests cr WHERE cr.account_id = a.id)::int AS decisions,
            (SELECT COUNT(*) FROM consume_requests cr WHERE cr.account_id = a.id AND cr.accepted)::int AS accepted
     FROM accounts a JOIN plans p ON p.id = a.plan_id
     WHERE a.id = ANY($1)`,
    [accountIds],
  );

  const rows = totals.rows;
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const checks = {
    'account counter = accepted units in history': rows.every((r) => r.account_used === r.accepted_units),
    'sum of user counters = account counter': rows.every((r) => r.users_used === r.account_used),
    'account usage <= monthly limit': rows.every((r) => r.account_used <= r.monthly_limit),
    // Requests still in flight when the timer stops are decided by the service but not counted by autocannon.
    'every 2xx response has a stored decision': sum('decisions') >= result['2xx'] && sum('decisions') - result['2xx'] <= CONNECTIONS,
  };
  return { checks, decisions: sum('decisions'), accepted: sum('accepted'), unitsUsed: sum('account_used'), limit: sum('monthly_limit'), scenario };
}

function formatReport(runs, startedAt) {
  const lines = [
    `# Load test: ${LABEL}`,
    '',
    `- Date: ${startedAt.toISOString()}`,
    `- ${CONNECTIONS} concurrent connections, ${DURATION} s per scenario, every request is POST /consume`,
    '',
    '| Scenario | Requests/s (avg) | p50 ms | p97.5 ms | p99 ms | Max ms | 2xx | Non-2xx | Errors |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const { scenario, result } of runs) {
    const l = result.latency;
    lines.push(
      `| ${scenario.name} | ${result.requests.average.toFixed(0)} | ${l.p50} | ${l.p97_5} | ${l.p99} | ${l.max} | ${result['2xx']} | ${result.non2xx} | ${result.errors + result.timeouts} |`,
    );
  }

  lines.push('', '## Correctness after the load', '');
  for (const { correctness } of runs) {
    const c = correctness;
    lines.push(`**${c.scenario.name}** (${c.scenario.description}): ${c.decisions} decisions, ${c.accepted} accepted, ${c.unitsUsed} units used`);
    if (c.scenario.name === 'limit-reached') lines.push(`(account limit: ${c.limit} units)`);
    lines.push('');
    for (const [check, ok] of Object.entries(c.checks)) lines.push(`- ${ok ? 'PASS' : 'FAIL'} ${check}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const startedAt = new Date();
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();

  const runs = [];
  for (const scenario of scenarios) {
    console.log(`Running ${scenario.name}: ${scenario.description}`);
    const run = await runScenario(scenario);
    run.correctness = await checkCorrectness(db, run);
    runs.push(run);
  }
  await db.end();

  const report = formatReport(runs, startedAt);
  console.log(`\n${report}`);

  fs.mkdirSync('results', { recursive: true });
  const file = `results/${LABEL}.md`;
  fs.writeFileSync(file, `${report}\n`);
  console.log(`Saved to load-test/${file}`);

  const failed = runs.some((run) => Object.values(run.correctness.checks).includes(false));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
