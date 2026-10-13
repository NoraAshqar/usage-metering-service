import crypto from 'crypto';

// A new random API key, e.g. "mk_3f9a...". Shown to the caller once and never stored.
export function generateApiKey(): string {
  return 'mk_' + crypto.randomBytes(24).toString('hex');
}

// What we store in accounts.api_key_hash. If the database leaks, the keys still can't be used.
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}
