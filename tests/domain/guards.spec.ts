import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DeliveryFacts } from '../../src/lib/domain/request/delivery';
import { evaluateGuards, fullyPaid, pricesFixed } from '../../src/lib/domain/request/guards';

/** Delivery is a story of its own (delivery-guard.spec.ts); here it must never hold a move back. */
const STOCK_DELIVERY: DeliveryFacts = {
	isStockRequest: true,
	deliveryAddressId: null,
	deliveryAt: null,
	deceasedName: null
};
import { GUARD_CODES } from '../../src/lib/types/request';

const minor = fc.integer({ min: 0, max: 5_000_00 });
const prices = fc.array(fc.integer({ min: -1_000, max: 500_00 }), { maxLength: 20 });

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('transition guards of tech.md 6.2', () => {
	it('calls a request priced only when it has lines and every line carries a price', () => {
		assertProperty(
			fc.property(prices, (lines) => {
				return pricesFixed(lines) === (lines.length > 0 && lines.every((price) => price > 0));
			})
		);
	});

	it('leaves a request without lines unpriced', () => {
		expect(pricesFixed([])).toBe(false);
	});

	it('treats the marks as a sum, whatever order they came in', () => {
		assertProperty(
			fc.property(minor, fc.array(minor, { maxLength: 10 }), (total, marks) => {
				const shuffled = [...marks].reverse();
				return fullyPaid(total, marks) === fullyPaid(total, shuffled);
			})
		);
	});

	it('never turns a covered request back into an unpaid one', () => {
		assertProperty(
			fc.property(minor, fc.array(minor, { maxLength: 10 }), minor, (total, marks, extra) => {
				if (!fullyPaid(total, marks)) return true;
				return fullyPaid(total, [...marks, extra]);
			})
		);
	});

	it('closes the payment exactly at the total, to the kopeck', () => {
		expect([fullyPaid(1000, [999]), fullyPaid(1000, [1000]), fullyPaid(1000, [400, 600])]).toEqual([
			false,
			true,
			true
		]);
	});

	it('answers every guard the table can ask about, so none is left undefined', () => {
		assertProperty(
			fc.property(
				fc.integer({ min: 0, max: 5 }),
				prices,
				minor,
				fc.array(minor, { maxLength: 5 }),
				(assigneeCount, unitPricesMinor, totalMinor, paymentMarksMinor) => {
					const guards = evaluateGuards({
						assigneeCount,
						unitPricesMinor,
						totalMinor,
						paymentMarksMinor,
						delivery: STOCK_DELIVERY
					});
					return GUARD_CODES.every((code) => typeof guards[code] === 'boolean');
				}
			)
		);
	});

	it('reads an assignee count of zero as no assignee', () => {
		const facts = {
			unitPricesMinor: [100],
			totalMinor: 100,
			paymentMarksMinor: [],
			delivery: STOCK_DELIVERY
		};

		expect([
			evaluateGuards({ ...facts, assigneeCount: 0 }).hasAssignee,
			evaluateGuards({ ...facts, assigneeCount: 1 }).hasAssignee
		]).toEqual([false, true]);
	});
});
