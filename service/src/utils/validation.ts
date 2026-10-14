import { HttpError } from '../errors';

// Small helpers that check request input and return it with the right type.
// They throw a 400 error with a clear message when the input is invalid.

// Largest value of a Postgres INT column. Bigger numbers would make the query fail.
const MAX_INT = 2_147_483_647;

function invalid(message: string): HttpError {
  return new HttpError(400, 'validation_error', message);
}

export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw invalid(`${field} must be at most ${maxLength} characters`);
  }
  return value.trim();
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, field);
}

export function requirePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > MAX_INT) {
    throw invalid(`${field} must be a whole number between 1 and ${MAX_INT}`);
  }
  return value;
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requirePositiveInt(value, field);
}

export function requireNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_INT) {
    throw invalid(`${field} must be a whole number between 0 and ${MAX_INT}`);
  }
  return value;
}

export function optionalNonNegativeInt(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requireNonNegativeInt(value, field);
}

export function requireOneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) {
    throw invalid(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

// Ids in the URL arrive as strings, e.g. /plans/12.
export function requireIdParam(value: string, field: string): number {
  if (!/^[1-9][0-9]{0,8}$/.test(value)) {
    throw invalid(`${field} must be a positive whole number`);
  }
  return Number(value);
}

// ?month=2026-10  ->  '2026-10-01' (the value stored in the `month` columns).
export function optionalMonthQuery(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw invalid('month must look like 2026-10');
  }
  return `${value}-01`;
}

// Query values are strings, e.g. ?limit=20. Returns `fallback` when the value is missing.
function queryInt(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  const number = typeof value === 'string' && /^[0-9]{1,9}$/.test(value) ? Number(value) : NaN;
  if (!(number >= min && number <= max)) {
    throw invalid(`${field} must be a whole number between ${min} and ${max}`);
  }
  return number;
}

export interface Page {
  limit: number;
  offset: number;
}

// ?limit=20&offset=40  ->  rows 41-60. Default: the first 20 rows. At most 100 per page.
export function pageQuery(query: { limit?: unknown; offset?: unknown }): Page {
  return {
    limit: queryInt(query.limit, 'limit', 1, 100, 20),
    offset: queryInt(query.offset, 'offset', 0, 1_000_000_000, 0),
  };
}
