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

	it('holds a covered request open while the counterparty owes on other requests (v1.65)', () => {
		assertProperty(
			fc.property(minor, fc.array(minor, { maxLength: 10 }), minor, (total, marks, other) => {
				return fullyPaid(total, marks, other) === (fullyPaid(total, marks) && other === 0);
			})
		);
		expect([fullyPaid(1000, [1000], 500), fullyPaid(1000, [1000], 0)]).toEqual([false, true]);
	});

	it('answers every guard the table can ask about, so none is left undefined', () => {
		assertProperty(
			fc.property(
				fc.boolean(),
				prices,
				minor,
				fc.array(minor, { maxLength: 5 }),
				(stockCovered, unitPricesMinor, totalMinor, paymentMarksMinor) => {
					const guards = evaluateGuards({
						stockCovered,
						stockLinked: stockCovered,
						unitPricesMinor,
						totalMinor,
						paymentMarksMinor,
						otherDebtMinor: 0,
						delivery: STOCK_DELIVERY,
						loadedLines: []
					});
					return GUARD_CODES.every((code) => typeof guards[code] === 'boolean');
				}
			)
		);
	});

	it('passes the stock fill through as guard stockCovered (v1.41)', () => {
		const facts = {
			stockLinked: true,
			unitPricesMinor: [100],
			totalMinor: 100,
			paymentMarksMinor: [],
			otherDebtMinor: 0,
			delivery: STOCK_DELIVERY,
			loadedLines: []
		};

		expect([
			evaluateGuards({ ...facts, stockCovered: false }).stockCovered,
			evaluateGuards({ ...facts, stockCovered: true }).stockCovered
		]).toEqual([false, true]);
	});

	it('passes the stock links through as guard stockLinked (tech.md §6.2, invariant 10)', () => {
		const facts = {
			stockCovered: true,
			unitPricesMinor: [100],
			totalMinor: 100,
			paymentMarksMinor: [],
			otherDebtMinor: 0,
			delivery: STOCK_DELIVERY,
			loadedLines: []
		};

		expect([
			evaluateGuards({ ...facts, stockLinked: false }).stockLinked,
			evaluateGuards({ ...facts, stockLinked: true }).stockLinked
		]).toEqual([false, true]);
	});
});
