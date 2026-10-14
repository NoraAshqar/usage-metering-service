const SERVICE_URL = process.env.SERVICE_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'admin-secret';

export interface Plan {
  id: number;
  name: string;
  scope: 'account' | 'user';
  monthlyLimit: number;
  maxUnitsPerRequest: number;
}

export interface Decision {
  requestId: string;
  userId: string;
  units: number;
  accepted: boolean;
  rejectedBy: { level: 'account' | 'user'; rule: string } | null;
  remaining: { account: number; user: number };
  replayed: boolean;
}

interface LevelUsage {
  used: number;
  monthlyLimit: number;
  remaining: number;
  plan: { id: number; name: string };
}

export interface Usage {
  month: string;
  account: LevelUsage;
  users: (LevelUsage & { userId: string })[];
}

async function call<T>(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVICE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed with ${res.status}: ${data.error?.message}`);
  }
  return data as T;
}

export async function createAccount(name: string): Promise<string> {
  const result = await call<{ apiKey: string }>('POST', '/admin/accounts', { 'x-admin-key': ADMIN_KEY }, { name });
  return result.apiKey;
}

export class MeteringClient {
  constructor(private apiKey: string) {}

  private call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return call<T>(method, path, { 'x-api-key': this.apiKey }, body);
  }

  async findPlan(name: string): Promise<Plan> {
    const { plans } = await this.call<{ plans: Plan[] }>('GET', '/plans');
    const plan = plans.find((p) => p.name === name);
    if (!plan) throw new Error(`Plan ${name} not found`);
    return plan;
  }

  createPlan(plan: Omit<Plan, 'id'>): Promise<Plan> {
    return this.call('POST', '/plans', plan);
  }

  updatePlan(planId: number, changes: Partial<Omit<Plan, 'id' | 'scope'>>): Promise<Plan> {
    return this.call('PATCH', `/plans/${planId}`, changes);
  }

  setAccountPlan(planId: number) {
    return this.call('PUT', '/account/plan', { planId });
  }

  createUser(userId: string, planId: number) {
    return this.call('POST', '/users', { userId, planId });
  }

  setUserPlan(userId: string, planId: number) {
    return this.call('PUT', `/users/${userId}/plan`, { planId });
  }

  consume(userId: string, units: number, requestId: string): Promise<Decision> {
    return this.call('POST', '/consume', { userId, units, requestId });
  }

  usage(): Promise<Usage> {
    return this.call('GET', '/usage');
  }
}
