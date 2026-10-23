import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	kindOf,
	pickBucket,
	summarize,
	type FinanceLine
} from '../../src/lib/domain/finance/summary';
import { addDays } from '../../src/lib/domain/payroll/calc';
import { rangeDays, type ReportRange } from '../../src/lib/domain/report/period';
import { FINANCE_SOURCES } from '../../src/lib/types/finance';

const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };

const range = fc
	.tuple(fc.integer({ min: 0, max: 3650 }), fc.integer({ min: 0, max: 365 }))
	.map(([start, len]) => {
		const from = addDays('2020-01-01', start);
		return { from, to: addDays(from, len) };
	});
const lineIn = (r: ReportRange) =>
	fc.record({
		source: fc.constantFrom(...FINANCE_SOURCES),
		occurredOn: fc.integer({ min: 0, max: rangeDays(r) - 1 }).map((n) => addDays(r.from, n)),
		signedMinor: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 })
	});
const sums = (s: ReturnType<typeof summarize>) => ({
	...s,
	bySource: s.bySource.map((row) => ({ source: row.source, signedMinor: row.signedMinor }))
});
const world = range.chain((r) => fc.tuple(fc.constant(r), fc.array(lineIn(r), { maxLength: 60 })));

describe('finance summary (C18)', () => {
	it('counts a reversed payment as no income and a reversed transfer as no expense', () => {
		const lines: FinanceLine[] = [
			{ source: 'order_payment', occurredOn: '2026-10-05', signedMinor: 10_000 },
			{ source: 'order_payment', occurredOn: '2026-10-05', signedMinor: -10_000 },
			{ source: 'manual_expense', occurredOn: '2026-10-07', signedMinor: -3_000 },
			{ source: 'payroll', occurredOn: '2026-10-10', signedMinor: -2_000 },
			{ source: 'charity', occurredOn: '2026-10-12', signedMinor: -500 },
			{ source: 'charity', occurredOn: '2026-10-12', signedMinor: 500 }
		];

		const result = summarize(lines, OCTOBER);

		expect(result).toMatchObject({
			range: OCTOBER,
			incomeMinor: 0,
			expenseMinor: 5_000,
			netMinor: -5_000,
			bucket: 'day'
		});
		expect(result.bySource).toEqual([
			{ source: 'order_payment', signedMinor: 0, count: 2 },
			{ source: 'manual_income', signedMinor: 0, count: 0 },
			{ source: 'payroll', signedMinor: -2_000, count: 1 },
			{ source: 'charity', signedMinor: 0, count: 2 },
			{ source: 'manual_expense', signedMinor: -3_000, count: 1 }
		]);
		expect(result.buckets).toHaveLength(31);
		expect(result.buckets[6]).toEqual({
			from: '2026-10-07',
			to: '2026-10-07',
			incomeMinor: 0,
			expenseMinor: 3_000
		});
	});

	it('ignores a line outside the range', () => {
		const result = summarize(
			[{ source: 'manual_income', occurredOn: '2026-11-01', signedMinor: 700 }],
			OCTOBER
		);
		expect(result.incomeMinor).toBe(0);
		expect(result.bySource[1]).toEqual({ source: 'manual_income', signedMinor: 0, count: 0 });
	});

	it('picks a day up to 31 days, a week up to 92 and a month after that', () => {
		const span = (days: number) => ({ from: '2026-01-01', to: addDays('2026-01-01', days - 1) });
		expect(pickBucket(span(1))).toBe('day');
		expect(pickBucket(span(31))).toBe('day');
		expect(pickBucket(span(32))).toBe('week');
		expect(pickBucket(span(92))).toBe('week');
		expect(pickBucket(span(93))).toBe('month');
	});

	it('takes the kind from the source, never from the sign', () => {
		expect(FINANCE_SOURCES.map(kindOf)).toEqual([
			'income',
			'income',
			'expense',
			'expense',
			'expense'
		]);
		const refund = summarize(
			[{ source: 'payroll', occurredOn: '2026-10-03', signedMinor: 400 }],
			OCTOBER
		);
		expect(refund).toMatchObject({ incomeMinor: 0, expenseMinor: -400, netMinor: 400 });
	});

	it('nets income against expense', () => {
		fc.assert(
			fc.property(world, ([r, lines]) => {
				const s = summarize(lines, r);
				expect(s.netMinor).toBe(s.incomeMinor - s.expenseMinor);
				const total = s.bySource.reduce((sum, row) => sum + row.signedMinor, 0);
				expect(total).toBe(s.netMinor);
			})
		);
	});

	it('spreads the totals over the buckets without losing a kopeck', () => {
		fc.assert(
			fc.property(world, ([r, lines]) => {
				const s = summarize(lines, r);
				expect(s.buckets.reduce((sum, b) => sum + b.incomeMinor, 0)).toBe(s.incomeMinor);
				expect(s.buckets.reduce((sum, b) => sum + b.expenseMinor, 0)).toBe(s.expenseMinor);
			})
		);
	});

	it('lays the buckets end to end over the whole range', () => {
		fc.assert(
			fc.property(range, (r) => {
				const { buckets } = summarize([], r);
				expect(buckets[0]?.from).toBe(r.from);
				expect(buckets.at(-1)?.to).toBe(r.to);
				buckets.slice(1).forEach((bucket, i) => {
					expect(bucket.from).toBe(addDays(buckets[i]?.to ?? '', 1));
				});
			})
		);
	});

	it('is not moved by a line and its reversal', () => {
		fc.assert(
			fc.property(
				world.chain(([r, lines]) => fc.tuple(fc.constant(r), fc.constant(lines), lineIn(r))),
				([r, lines, extra]) => {
					const reversal = { ...extra, signedMinor: -extra.signedMinor };
					const before = summarize(lines, r);
					const after = summarize([...lines, extra, reversal], r);
					// The pair adds two lines to the count of its source; every sum stays put.
					expect(sums(after)).toEqual(sums(before));
				}
			)
		);
	});
});
