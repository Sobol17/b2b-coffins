import { describe, expect, it } from 'vitest';
import {
	supportFiltersSchema,
	supportOpenSchema,
	supportPostSchema
} from '../../src/lib/validation/support';

describe('support forms (tech.md 8, v1.57)', () => {
	it('refuses a message of blanks only', () => {
		expect(supportPostSchema.safeParse({ body: '  \n\t ' }).success).toBe(false);
	});

	it('refuses a message over 4000 characters', () => {
		expect(supportPostSchema.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false);
		expect(supportPostSchema.safeParse({ body: 'x'.repeat(4000) }).success).toBe(true);
	});

	it('trims the subject and drops an empty request', () => {
		expect(
			supportOpenSchema.parse({ subject: '  Сроки  ', body: 'Когда?', requestId: '' })
		).toEqual({
			subject: 'Сроки',
			body: 'Когда?'
		});
	});

	it('reads the request id from the form', () => {
		const parsed = supportOpenSchema.parse({ subject: 'Сроки', body: 'Когда?', requestId: '17' });
		expect(parsed.requestId).toBe(17);
	});

	it('refuses a subject shorter than 3 or longer than 120 characters', () => {
		expect(supportOpenSchema.safeParse({ subject: 'ab', body: 'x' }).success).toBe(false);
		expect(supportOpenSchema.safeParse({ subject: 'a'.repeat(121), body: 'x' }).success).toBe(
			false
		);
	});

	it('names the problem in Russian', () => {
		const result = supportOpenSchema.safeParse({ subject: 'ab', body: ' ' });
		const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
		expect(messages).toEqual(['Тема от 3 до 120 символов', 'Напишите сообщение']);
	});

	it('drops a tampered filter instead of failing the page', () => {
		expect(
			supportFiltersSchema.parse({ status: 'nope', awaiting: 'x', counterpartyId: 'a' })
		).toEqual({});
		expect(supportFiltersSchema.parse({ status: 'open', awaiting: 'crm', q: ' 0042 ' })).toEqual({
			status: 'open',
			awaiting: 'crm',
			q: '0042'
		});
	});
});
