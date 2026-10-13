import { HttpError } from '../errors';

// Small helpers that check request input and return it with the right type.
// They throw a 400 error with a clear message when the input is invalid.

export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, 'validation_error', `${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new HttpError(400, 'validation_error', `${field} must be at most ${maxLength} characters`);
  }
  return value.trim();
}

export function requirePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, 'validation_error', `${field} must be a positive whole number`);
  }
  return value;
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requirePositiveInt(value, field);
}
