import { HttpError } from '../errors';

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

export function requireIdParam(value: string, field: string): number {
  if (!/^[1-9][0-9]{0,8}$/.test(value)) {
    throw invalid(`${field} must be a positive whole number`);
  }
  return Number(value);
}

export function optionalMonthQuery(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw invalid('month must look like 2026-10');
  }
  return `${value}-01`;
}

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

export function pageQuery(query: { limit?: unknown; offset?: unknown }): Page {
  return {
    limit: queryInt(query.limit, 'limit', 1, 100, 20),
    offset: queryInt(query.offset, 'offset', 0, 1_000_000_000, 0),
  };
}
