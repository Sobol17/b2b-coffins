import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocatePayment, type OpenRequest } from '../../src/lib/domain/payment/allocate';

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const openRequests = fc
	.array(fc.integer({ min: 0, max: 50_000_00 }), { minLength: 1, maxLength: 8 })
	.map((dues): OpenRequest[] =>
		dues.map((dueMinor, index) => ({ requestId: index + 1, dueMinor }))
	);

const debtOf = (open: readonly OpenRequest[]) =>
	open.reduce((sum, request) => sum + request.dueMinor, 0);

describe('a payment of the counterparty spreads over its requests (v1.65)', () => {
	it('splits 15 000 of a 30 000 debt oldest first', () => {
		const open = [
			{ requestId: 1, dueMinor: 10_000_00 },
			{ requestId: 2, dueMinor: 10_000_00 },
			{ requestId: 3, dueMinor: 10_000_00 }
		];
		expect(allocatePayment(open, 15_000_00)).toEqual({
			ok: true,
			amountMinor: 15_000_00,
			allocations: [
				{ requestId: 1, amountMinor: 10_000_00 },
				{ requestId: 2, amountMinor: 5_000_00 }
			]
		});
	});

	it('writes exactly the accepted amount, never above the rest of a request', () => {
		assertProperty(
			fc.property(openRequests, fc.integer({ min: 1, max: 500_000_00 }), (open, entered) => {
				const verdict = allocatePayment(open, entered);
				if (!verdict.ok) return true;
				const written = verdict.allocations.reduce((sum, row) => sum + row.amountMinor, 0);
				const due = new Map(open.map((request) => [request.requestId, request.dueMinor]));
				return (
					written === verdict.amountMinor &&
					verdict.allocations.every(
						(row) => row.amountMinor > 0 && row.amountMinor <= (due.get(row.requestId) ?? 0)
					)
				);
			})
		);
	});

	it('fills a request completely before the next one gets money', () => {
		assertProperty(
			fc.property(openRequests, fc.integer({ min: 1, max: 500_000_00 }), (open, entered) => {
				const verdict = allocatePayment(open, entered);
				if (!verdict.ok) return true;
				const due = new Map(open.map((request) => [request.requestId, request.dueMinor]));
				return verdict.allocations
					.slice(0, -1)
					.every((row) => row.amountMinor === due.get(row.requestId));
			})
		);
	});

	it('refuses more than the debt and a payment with nothing owed', () => {
		assertProperty(
			fc.property(openRequests, fc.integer({ min: 100, max: 10_000_00 }), (open, extra) => {
				const debt = debtOf(open);
				const verdict = allocatePayment(open, debt + extra);
				return debt === 0
					? !verdict.ok && verdict.refusal === 'nothing_due'
					: !verdict.ok && verdict.refusal === 'overpayment';
			})
		);
	});

	it('takes an amount within a ruble of the debt as the whole debt', () => {
		const open = [
			{ requestId: 1, dueMinor: 5_000_40 },
			{ requestId: 2, dueMinor: 3_000_00 }
		];
		const verdict = allocatePayment(open, 8_000_00);
		expect(verdict).toMatchObject({ ok: true, amountMinor: 8_000_40 });
	});
});
