import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	isLaunched,
	isSteerable,
	itemsEditMode,
	keepDiscountShare
} from '../../src/lib/domain/request/amendment';
import { requestTotals } from '../../src/lib/domain/request/pricing';
import { REQUEST_STATUSES } from '../../src/lib/types/request';

const total = fc.integer({ min: 1, max: 5_000_000_00 });
const percent = fc.integer({ min: 0, max: 100 });

function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('the discount of an accepted request keeps its share (C4)', () => {
	it('leaves the totals as they were when the items total does not move', () => {
		assertProperty(
			fc.property(total, percent, (items, rate) => {
				const before = requestTotals([items], rate);
				const after = keepDiscountShare(before, before.itemsTotalMinor);
				return (
					after.discountMinor === before.discountMinor && after.totalMinor === before.totalMinor
				);
			})
		);
	});

	it('stays within a kopeck of the agreed share and never exceeds the items', () => {
		assertProperty(
			fc.property(total, percent, total, (items, rate, next) => {
				const before = requestTotals([items], rate);
				const after = keepDiscountShare(before, next);
				const exact = (before.discountMinor * next) / before.itemsTotalMinor;
				return (
					Math.abs(after.discountMinor - exact) <= 0.5 &&
					after.discountMinor <= next &&
					after.totalMinor === next - after.discountMinor
				);
			})
		);
	});

	it('grows with the items, so adding a line never lowers what the counterparty pays', () => {
		assertProperty(
			fc.property(total, percent, total, total, (items, rate, a, b) => {
				const before = requestTotals([items], rate);
				const [low, high] = a <= b ? [a, b] : [b, a];
				return (
					keepDiscountShare(before, low).totalMinor <= keepDiscountShare(before, high).totalMinor
				);
			})
		);
	});

	it('gives no discount to a request that had none, and refuses a broken total', () => {
		expect(keepDiscountShare(requestTotals([10_000], 0), 25_000).discountMinor).toBe(0);
		expect(() => keepDiscountShare(requestTotals([10_000], 5), -1)).toThrow(RangeError);
		expect(() => keepDiscountShare(requestTotals([10_000], 5), 1.5)).toThrow(RangeError);
	});
});

describe('what may change in which status (C4)', () => {
	it('reprices freely before acceptance, controls in work and closes afterwards', () => {
		expect(itemsEditMode('new')).toBe('free');
		expect(itemsEditMode('in_work')).toBe('controlled');
		for (const status of REQUEST_STATUSES) {
			if (status !== 'new' && status !== 'in_work') expect(itemsEditMode(status)).toBe('closed');
		}
	});

	it('writes history for every status after new and steers only until delivery', () => {
		expect(isLaunched('new')).toBe(false);
		expect(isLaunched('draft')).toBe(false);
		expect(isLaunched('in_work')).toBe(true);
		expect(REQUEST_STATUSES.filter(isSteerable)).toEqual(['new', 'in_work', 'ready']);
	});
});
