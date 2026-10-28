import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addMargins, marginOf, ZERO_MARGIN } from '../../src/lib/domain/report/margin';

const money = fc.integer({ min: 0, max: 1_000_000_00 });
const line = fc.record({
	qty: fc.integer({ min: 1, max: 50 }),
	totalMinor: money,
	costMinor: money
});

describe('margin of a sale (v1.63)', () => {
	it('is the sum minus the cost, its share in basis points of the sum', () => {
		expect(marginOf({ qty: 2, totalMinor: 20_000_00, costMinor: 15_000_00 })).toEqual({
			qty: 2,
			totalMinor: 20_000_00,
			costMinor: 15_000_00,
			marginMinor: 5_000_00,
			marginBp: 2500
		});
	});

	it('goes below zero when the cost beats the sum', () => {
		expect(marginOf({ qty: 1, totalMinor: 1000_00, costMinor: 1500_00 })).toMatchObject({
			marginMinor: -500_00,
			marginBp: -5000
		});
	});

	it('has no share for a free sale', () => {
		expect(marginOf({ qty: 1, totalMinor: 0, costMinor: 0 }).marginBp).toBeNull();
		expect(ZERO_MARGIN.marginBp).toBeNull();
	});

	it('keeps cost plus margin equal to the sum', () => {
		fc.assert(
			fc.property(line, (input) => {
				const result = marginOf(input);
				expect(result.costMinor + result.marginMinor).toBe(result.totalMinor);
			})
		);
	});

	it('gives the share the sign of the margin and never more than the whole sum', () => {
		fc.assert(
			fc.property(line, (input) => {
				const { marginMinor, marginBp } = marginOf(input);
				expect(marginBp === null).toBe(input.totalMinor === 0);
				const bp = marginBp ?? 0;
				expect(bp * Math.sign(marginMinor)).toBeGreaterThanOrEqual(0);
				expect(bp).toBeLessThanOrEqual(10_000);
			})
		);
	});

	it('adds up: the margin of the sums is the sum of the margins', () => {
		fc.assert(
			fc.property(fc.array(line, { maxLength: 20 }), (lines) => {
				const folded = lines.map(marginOf).reduce(addMargins, ZERO_MARGIN);
				const whole = marginOf({
					qty: lines.reduce((s, l) => s + l.qty, 0),
					totalMinor: lines.reduce((s, l) => s + l.totalMinor, 0),
					costMinor: lines.reduce((s, l) => s + l.costMinor, 0)
				});
				expect(folded).toEqual(whole);
			})
		);
	});
});
