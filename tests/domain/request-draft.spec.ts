import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	nextNumber,
	periodKeyOf,
	type SequenceState
} from '../../src/lib/domain/numbering/numbering';
import { checkOptionSelection, sameSelection } from '../../src/lib/domain/request/item-options';
import { lineTotalMinor, requestTotals } from '../../src/lib/domain/request/pricing';
import { OPTION_KINDS } from '../../src/lib/types/catalog';

const money = fc.integer({ min: 0, max: 10_000_000 });
const qty = fc.integer({ min: 1, max: 999 });

describe('request line and totals', () => {
	it('prices a line as the variant price plus surcharges, times the quantity', () => {
		fc.assert(
			fc.property(
				money,
				fc.array(fc.integer({ min: 0, max: 500_000 }), { maxLength: 5 }),
				qty,
				(unit, deltas, count) => {
					const expected = (unit + deltas.reduce((sum, delta) => sum + delta, 0)) * count;
					expect(
						lineTotalMinor({ unitPriceMinor: unit, optionDeltasMinor: deltas, qty: count })
					).toBe(expected);
				}
			)
		);
	});

	it('refuses a quantity that is not a positive whole number', () => {
		for (const bad of [0, -1, 1.5]) {
			expect(() =>
				lineTotalMinor({ unitPriceMinor: 100, optionDeltasMinor: [], qty: bad })
			).toThrow(RangeError);
		}
	});

	it('keeps total = items - discount, with the discount never above the items', () => {
		fc.assert(
			fc.property(
				fc.array(money, { maxLength: 12 }),
				fc.integer({ min: 0, max: 100 }),
				(lines, percent) => {
					const totals = requestTotals(lines, percent);
					expect(totals.itemsTotalMinor).toBe(lines.reduce((sum, value) => sum + value, 0));
					expect(totals.totalMinor).toBe(totals.itemsTotalMinor - totals.discountMinor);
					expect(totals.discountMinor).toBeGreaterThanOrEqual(0);
					expect(totals.discountMinor).toBeLessThanOrEqual(totals.itemsTotalMinor);
				}
			)
		);
	});

	it('applies the discount to the sum, not line by line', () => {
		// Three lines of 0,50 ₽ at 1 %: per line each rounds to 0,01 ₽ (0,03 ₽); on the sum it is 0,02 ₽.
		expect(requestTotals([50, 50, 50], 1)).toEqual({
			itemsTotalMinor: 150,
			discountMinor: 2,
			totalMinor: 148
		});
	});
});

describe('option selection against the compatibility matrix', () => {
	const allowedArb = fc.uniqueArray(
		fc.record({ id: fc.integer({ min: 1, max: 60 }), kind: fc.constantFrom(...OPTION_KINDS) }),
		{ selector: (option) => option.id, maxLength: 20 }
	);

	it('accepts one allowed option of each kind and returns the ids sorted', () => {
		fc.assert(
			fc.property(allowedArb, (allowed) => {
				const onePerKind = [...new Map(allowed.map((option) => [option.kind, option.id])).values()];
				const result = checkOptionSelection(allowed, onePerKind);
				expect(result).toEqual({ ok: true, optionIds: [...onePerKind].sort((a, b) => a - b) });
			})
		);
	});

	it('refuses an option outside the matrix of the variant', () => {
		fc.assert(
			fc.property(allowedArb, fc.integer({ min: 61, max: 999 }), (allowed, stranger) => {
				expect(checkOptionSelection(allowed, [stranger])).toEqual({
					ok: false,
					reason: 'not_allowed',
					optionId: stranger
				});
			})
		);
	});

	it('refuses the same option twice and two options of one kind', () => {
		const allowed = [
			{ id: 1, kind: 'finish' as const },
			{ id: 2, kind: 'finish' as const },
			{ id: 3, kind: 'upholstery' as const }
		];
		expect(checkOptionSelection(allowed, [3, 3])).toMatchObject({ ok: false, reason: 'duplicate' });
		expect(checkOptionSelection(allowed, [1, 2])).toMatchObject({
			ok: false,
			reason: 'kind_twice'
		});
	});

	it('treats a selection as the same whatever the order', () => {
		fc.assert(
			fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { maxLength: 6 }), (ids) => {
				expect(sameSelection(ids, [...ids].reverse())).toBe(true);
				expect(sameSelection(ids, [...ids, 51])).toBe(false);
			})
		);
	});
});

describe('document numbering', () => {
	const state: SequenceState = { prefix: 'З-', period: 'year', periodKey: '', lastValue: 0 };
	const moment = fc.date({
		min: new Date('2024-01-01T00:00:00Z'),
		max: new Date('2030-12-31T00:00:00Z'),
		noInvalidDate: true
	});

	it('never repeats a number over a run of requests, across period changes', () => {
		fc.assert(
			fc.property(fc.array(moment, { minLength: 1, maxLength: 40 }), (moments) => {
				let current = state;
				const numbers = [...moments]
					.sort((a, b) => a.getTime() - b.getTime())
					.map((at) => {
						const next = nextNumber(current, at, 'Europe/Moscow');
						current = { ...current, periodKey: next.periodKey, lastValue: next.value };
						return next.number;
					});
				expect(new Set(numbers).size).toBe(numbers.length);
			})
		);
	});

	it('counts up inside a period and starts from one in the next', () => {
		const first = nextNumber(state, new Date('2026-09-15T10:00:00Z'), 'Europe/Moscow');
		const second = nextNumber(
			{ ...state, periodKey: first.periodKey, lastValue: first.value },
			new Date('2026-12-31T10:00:00Z'),
			'Europe/Moscow'
		);
		const nextYear = nextNumber(
			{ ...state, periodKey: second.periodKey, lastValue: second.value },
			new Date('2027-01-01T10:00:00Z'),
			'Europe/Moscow'
		);

		expect([first.number, second.number, nextYear.number]).toEqual([
			'З-2026-00001',
			'З-2026-00002',
			'З-2027-00001'
		]);
	});

	it('takes the year in the organisation timezone, not in UTC', () => {
		// 22:30 UTC on 31 December is already the new year in Moscow.
		expect(periodKeyOf('year', new Date('2026-12-31T22:30:00Z'), 'Europe/Moscow')).toBe('2027');
		expect(periodKeyOf('month', new Date('2026-09-15T00:00:00Z'), 'UTC')).toBe('2026-09');
		expect(nextNumber({ ...state, period: 'none' }, new Date(), 'UTC').number).toBe('З-00001');
	});
});
