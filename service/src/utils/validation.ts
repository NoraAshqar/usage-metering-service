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
