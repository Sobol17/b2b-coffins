import { describe, expect, it } from 'vitest';
import { httpStatusFor, publicErrorBody } from '../../src/lib/server/core/errors';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';

describe('AppError to HTTP mapping', () => {
	it('maps every domain error to the status from tech.md 4.2', () => {
		expect(httpStatusFor(new ValidationError())).toBe(422);
		expect(httpStatusFor(new ForbiddenError('request.accept'))).toBe(403);
		expect(httpStatusFor(new NotFoundError('request'))).toBe(404);
		expect(httpStatusFor(new ConflictError('invalid transition'))).toBe(409);
	});

	it('hides unknown errors behind a neutral 500 body', () => {
		const body = publicErrorBody(new Error('connection string leaked here'));

		expect(httpStatusFor(new Error('boom'))).toBe(500);
		expect(body).toEqual({ code: 'internal', message: 'internal error' });
	});
});
