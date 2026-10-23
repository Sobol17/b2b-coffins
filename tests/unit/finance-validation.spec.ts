import { describe, expect, it } from 'vitest';
import {
	financeDeleteSchema,
	financeEntrySchema,
	financeEntryUpdateSchema,
	financeFiltersSchema
} from '../../src/lib/validation/finance';

const entry = (patch: Record<string, string> = {}) => ({
	kind: 'expense',
	amountMinor: '150000',
	occurredOn: '2026-10-20',
	comment: 'Аренда',
	...patch
});
const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
	result.error?.issues[0]?.message;

describe('finance entry input (C18)', () => {
	it('reads the form into a typed entry with a trimmed comment', () => {
		expect(financeEntrySchema.parse(entry({ comment: '  Аренда  ' }))).toEqual({
			kind: 'expense',
			amountMinor: 150000,
			occurredOn: '2026-10-20',
			comment: 'Аренда'
		});
	});

	it('refuses a zero, a fractional and an oversized amount', () => {
		expect(firstMessage(financeEntrySchema.safeParse(entry({ amountMinor: '0' })))).toBe(
			'Введите сумму'
		);
		expect(firstMessage(financeEntrySchema.safeParse(entry({ amountMinor: '1.5' })))).toBe(
			'Введите сумму'
		);
		expect(firstMessage(financeEntrySchema.safeParse(entry({ amountMinor: '10000000001' })))).toBe(
			'Сумма слишком большая'
		);
		expect(financeEntrySchema.safeParse(entry({ amountMinor: '10000000000' })).success).toBe(true);
	});

	it('requires a comment of at most 500 characters', () => {
		expect(firstMessage(financeEntrySchema.safeParse(entry({ comment: '   ' })))).toBe(
			'Введите комментарий'
		);
		expect(financeEntrySchema.safeParse(entry({ comment: 'а'.repeat(500) })).success).toBe(true);
		expect(financeEntrySchema.safeParse(entry({ comment: 'а'.repeat(501) })).success).toBe(false);
	});

	it('refuses an unknown kind and a date in another shape', () => {
		expect(financeEntrySchema.safeParse(entry({ kind: 'transfer' })).success).toBe(false);
		expect(firstMessage(financeEntrySchema.safeParse(entry({ occurredOn: '20.10.2026' })))).toBe(
			'Выберите дату'
		);
	});

	it('adds the id for an edit and a delete', () => {
		expect(financeEntryUpdateSchema.parse({ ...entry(), id: '7' })).toMatchObject({ id: 7 });
		expect(financeEntryUpdateSchema.safeParse(entry()).success).toBe(false);
		expect(financeDeleteSchema.parse({ id: '7' })).toEqual({ id: 7 });
		expect(financeDeleteSchema.safeParse({ id: '0' }).success).toBe(false);
	});
});

describe('finance filters (C18)', () => {
	it('drops a blank or unknown filter instead of failing the page', () => {
		expect(
			financeFiltersSchema.parse({
				from: '2026-10-01',
				to: '2026-10-31',
				kind: '',
				source: 'bogus'
			})
		).toEqual({ from: '2026-10-01', to: '2026-10-31', kind: null, source: null });
		expect(
			financeFiltersSchema.parse({
				from: '2026-10-01',
				to: '2026-10-31',
				kind: 'income',
				source: 'payroll'
			})
		).toEqual({ from: '2026-10-01', to: '2026-10-31', kind: 'income', source: 'payroll' });
	});

	it('keeps the report period rule', () => {
		expect(
			firstMessage(financeFiltersSchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }))
		).toBe('Период не длиннее года');
	});
});
