export const ERROR_CODES = [
	'validation_failed',
	'forbidden',
	'not_found',
	'conflict',
	'rate_limited',
	'internal'
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
	constructor(
		readonly code: ErrorCode,
		msg: string,
		readonly meta?: Record<string, unknown>
	) {
		super(msg);
		this.name = new.target.name;
	}
}

export class ValidationError extends AppError {
	constructor(msg = 'validation failed', meta?: Record<string, unknown>) {
		super('validation_failed', msg, meta);
	}
}

export class ForbiddenError extends AppError {
	constructor(action: string, meta?: Record<string, unknown>) {
		super('forbidden', `action not allowed: ${action}`, meta);
	}
}

export class NotFoundError extends AppError {
	constructor(entity: string, meta?: Record<string, unknown>) {
		super('not_found', `${entity} not found`, meta);
	}
}

/** Invalid status transition, closed payroll week, stale write. */
export class ConflictError extends AppError {
	constructor(msg: string, meta?: Record<string, unknown>) {
		super('conflict', msg, meta);
	}
}

export class RateLimitError extends AppError {
	constructor(
		action: string,
		readonly retryAfterSec: number
	) {
		super('rate_limited', `too many attempts: ${action}`, { retryAfterSec });
	}
}

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
	validation_failed: 422,
	forbidden: 403,
	not_found: 404,
	conflict: 409,
	rate_limited: 429,
	internal: 500
};

export function httpStatusFor(err: unknown): number {
	return err instanceof AppError ? STATUS_BY_CODE[err.code] : 500;
}

/** Neutral body for the client. Stack and meta stay in the log. */
export function publicErrorBody(err: unknown): { code: ErrorCode; message: string } {
	if (err instanceof AppError) return { code: err.code, message: err.message };
	return { code: 'internal', message: 'internal error' };
}
