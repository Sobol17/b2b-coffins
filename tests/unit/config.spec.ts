import { describe, expect, it } from 'vitest';
import { httpStatusFor, publicErrorBody } from '../../src/lib/server/core/errors';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
	ValidationError,
	userMessage
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

describe('messages a form may show', () => {
	it('hides internal action and entity names behind fixed phrases', () => {
		const shown = [
			userMessage(new ForbiddenError('request.read.own')),
			userMessage(new NotFoundError('delivery address')),
			userMessage(new RateLimitError('request.comment', 60)),
			userMessage(new ValidationError())
		];

		for (const text of shown) {
			expect(text).toMatch(/^[А-ЯЁ]/);
			expect(text).not.toMatch(/request\.|address|not found|not allowed|too many|validation/);
		}
	});

	it('keeps the Russian text a service wrote for a validation or a conflict', () => {
		expect(userMessage(new ValidationError('Укажите причину'))).toBe('Укажите причину');
		expect(userMessage(new ConflictError('Заявка уже отправлена'))).toBe('Заявка уже отправлена');
	});
});
