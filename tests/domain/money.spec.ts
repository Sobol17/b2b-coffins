import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyPercent, fromMinor, roundHalfUp, sumMinor, toMinor } from '../../src/lib/utils/money';

describe('money in whole minor units', () => {
	it('rounds a half away from zero in both directions', () => {
		expect(roundHalfUp(0.5)).toBe(1);
		expect(roundHalfUp(1.5)).toBe(2);
		expect(roundHalfUp(2.5)).toBe(3);
		expect(roundHalfUp(-0.5)).toBe(-1);
		expect(roundHalfUp(-2.5)).toBe(-3);
	});

	it('keeps every conversion on an integer number of kopecks', () => {
		expect(() =>
			fc.assert(
				fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (major) =>
					Number.isInteger(toMinor(major))
				)
			)
		).not.toThrow();
	});

	it('round-trips a whole-kopeck amount through rubles', () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc.integer({ min: -1e9, max: 1e9 }),
					(minor) => toMinor(fromMinor(minor)) === minor
				)
			)
		).not.toThrow();
	});

	it('never returns a fractional kopeck from a percent discount', () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 1e9 }),
					fc.integer({ min: 0, max: 100 }),
					(minor, percent) => {
						const discount = applyPercent(minor, percent);
						return Number.isInteger(discount) && discount >= 0 && discount <= minor;
					}
				)
			)
		).not.toThrow();
	});

	it('sums an empty basket to zero', () => {
		expect(sumMinor([])).toBe(0);
		expect(sumMinor([120000, 45000, 5])).toBe(165005);
	});
});
