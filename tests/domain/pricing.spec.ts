import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	discountMinor,
	discountPercentOf,
	isPriceListActive,
	resolveUnitPrice
} from '../../src/lib/domain/request/pricing';

const price = fc.integer({ min: 0, max: 100_000_000 });
const maybePrice = fc.option(price, { nil: undefined });
const percent = fc.integer({ min: 0, max: 100 });
const moment = fc.date({
	min: new Date('2020-01-01T00:00:00Z'),
	max: new Date('2030-01-01T00:00:00Z'),
	noInvalidDate: true
});

describe('personal unit price', () => {
	it('takes the counterparty list whenever it has an entry', () => {
		fc.assert(
			fc.property(price, maybePrice, price, (base, baseList, personal) => {
				const input = {
					basePriceMinor: base,
					baseListPriceMinor: baseList,
					personalListPriceMinor: personal
				};
				expect(resolveUnitPrice(input)).toBe(personal);
			})
		);
	});

	it('falls back to the base list, then to the variant price', () => {
		fc.assert(
			fc.property(price, maybePrice, (base, baseList) => {
				const resolved = resolveUnitPrice({ basePriceMinor: base, baseListPriceMinor: baseList });
				expect(resolved).toBe(baseList ?? base);
			})
		);
	});

	it('never invents a number that none of the sources holds', () => {
		fc.assert(
			fc.property(price, maybePrice, maybePrice, (base, baseList, personal) => {
				const resolved = resolveUnitPrice({
					basePriceMinor: base,
					baseListPriceMinor: baseList,
					personalListPriceMinor: personal
				});
				expect([base, baseList, personal]).toContain(resolved);
			})
		);
	});
});

describe('price list window', () => {
	it('is active inside the window and inactive outside of it', () => {
		fc.assert(
			fc.property(moment, moment, moment, (a, b, at) => {
				const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
				const inside = from.getTime() <= at.getTime() && at.getTime() < to.getTime();
				expect(isPriceListActive({ validFrom: from, validTo: to }, at)).toBe(inside);
			})
		);
	});

	it('treats open ends as unbounded', () => {
		fc.assert(
			fc.property(moment, (at) => {
				expect(isPriceListActive({ validFrom: null, validTo: null }, at)).toBe(true);
			})
		);
	});

	it('is already over at the exact end moment', () => {
		const end = new Date('2026-10-01T00:00:00Z');
		expect(isPriceListActive({ validFrom: null, validTo: end }, end)).toBe(false);
	});
});

describe('contract discount', () => {
	it('stays a whole number between zero and the total', () => {
		fc.assert(
			fc.property(price, percent, (total, pct) => {
				const discount = discountMinor(total, pct);
				expect(Number.isInteger(discount)).toBe(true);
				expect(discount).toBeGreaterThanOrEqual(0);
				expect(discount).toBeLessThanOrEqual(total);
			})
		);
	});

	it('never shrinks when the percent grows', () => {
		fc.assert(
			fc.property(price, percent, percent, (total, a, b) => {
				const [low, high] = a <= b ? [a, b] : [b, a];
				expect(discountMinor(total, low)).toBeLessThanOrEqual(discountMinor(total, high));
			})
		);
	});

	it('is zero at 0 % and the whole total at 100 %', () => {
		fc.assert(
			fc.property(price, (total) => {
				expect(discountMinor(total, 0)).toBe(0);
				expect(discountMinor(total, 100)).toBe(total);
			})
		);
	});

	it('refuses a percent or a total that cannot come from the data', () => {
		expect(() => discountMinor(1000, 101)).toThrow(RangeError);
		expect(() => discountMinor(1000, -1)).toThrow(RangeError);
		expect(() => discountMinor(1000, 4.5)).toThrow(RangeError);
		expect(() => discountMinor(-1, 4)).toThrow(RangeError);
	});

	it('rounds half up on the kopeck, like the rest of the app', () => {
		expect(discountMinor(12_345, 4)).toBe(494);
		expect(discountMinor(50, 1)).toBe(1);
	});
});

describe('discount percent behind a frozen request (P6)', () => {
	it('reads back the percent the request was priced with', () => {
		fc.assert(
			fc.property(fc.integer({ min: 10_000, max: 100_000_000 }), percent, (total, rate) => {
				expect(discountPercentOf(total, discountMinor(total, rate))).toBe(rate);
			})
		);
	});

	it('calls a request without a discount a request at zero percent', () => {
		expect(discountPercentOf(120_000, 0)).toBe(0);
		expect(discountPercentOf(0, 0)).toBe(0);
	});
});
