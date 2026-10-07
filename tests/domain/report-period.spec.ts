import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	bucketOf,
	bucketsOf,
	presetRange,
	rangeDays,
	rangeProblem,
	reportWindow
} from '../../src/lib/domain/report/period';
import { addDays } from '../../src/lib/domain/payroll/calc';
import { SALES_BUCKETS } from '../../src/lib/types/crm-reports';

const day = fc.integer({ min: 0, max: 3650 }).map((n) => addDays('2020-01-01', n));
const range = fc
	.tuple(day, fc.integer({ min: 0, max: 365 }))
	.map(([from, len]) => ({ from, to: addDays(from, len) }));

describe('report period (C13)', () => {
	it('keeps the last evening of the range and drops the next morning', () => {
		const window = reportWindow({ from: '2026-10-01', to: '2026-10-31' }, 'Europe/Moscow');
		expect(window?.from.toISOString()).toBe('2026-09-30T21:00:00.000Z');
		expect(window?.to.toISOString()).toBe('2026-10-31T21:00:00.000Z');
		expect(window?.days).toBe(31);
	});

	it('names what is wrong with a range', () => {
		expect(rangeProblem({ from: '2026-02-31', to: '2026-03-01' }, 366)).toBe('not_a_date');
		expect(rangeProblem({ from: '2026-03-02', to: '2026-03-01' }, 366)).toBe('reversed');
		expect(rangeProblem({ from: '2025-01-01', to: '2026-01-02' }, 366)).toBe('too_long');
		expect(rangeProblem({ from: '2025-01-01', to: '2026-01-01' }, 366)).toBeNull();
	});

	it('opens presets from the start of the current span to today', () => {
		expect(presetRange('week', '2026-10-07')).toEqual({ from: '2026-10-05', to: '2026-10-07' });
		expect(presetRange('month', '2026-10-07')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
		expect(presetRange('quarter', '2026-11-20')).toEqual({ from: '2026-10-01', to: '2026-11-20' });
		expect(presetRange('year', '2026-10-07')).toEqual({ from: '2026-01-01', to: '2026-10-07' });
	});

	it('covers the range with buckets, no gaps and no overlaps', () => {
		fc.assert(
			fc.property(range, fc.constantFrom(...SALES_BUCKETS), (r, bucket) => {
				const buckets = bucketsOf(r, bucket);
				expect(buckets[0]?.from).toBe(r.from);
				expect(buckets.at(-1)?.to).toBe(r.to);
				for (let i = 1; i < buckets.length; i += 1) {
					expect(buckets[i]?.from).toBe(addDays(buckets[i - 1]?.to ?? '', 1));
				}
				expect(buckets.reduce((sum, b) => sum + rangeDays(b), 0)).toBe(rangeDays(r));
			})
		);
	});

	it('puts every day of the range into the bucket that holds it', () => {
		fc.assert(
			fc.property(range, fc.constantFrom(...SALES_BUCKETS), fc.nat(), (r, bucket, n) => {
				const d = addDays(r.from, n % rangeDays(r));
				const b = bucketOf(d, bucket, r);
				expect(b.from <= d && d <= b.to).toBe(true);
				expect(bucketsOf(r, bucket)).toContainEqual(b);
			})
		);
	});
});
