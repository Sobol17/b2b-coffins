import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	DEBT_STATUSES,
	counterpartyDebt,
	requestDebtMinor,
	type DebtRequest
} from '../../src/lib/domain/payment/debt';
import { REQUEST_STATUSES } from '../../src/lib/types/request';

const minor = fc.integer({ min: 0, max: 5_000_000_00 });
const marks = fc.array(fc.integer({ min: 1, max: 1_000_000_00 }), { maxLength: 6 });
const request: fc.Arbitrary<DebtRequest> = fc.record({
	status: fc.constantFrom(...REQUEST_STATUSES),
	totalMinor: minor,
	marksMinor: marks
});

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe('debt from the payment marks (tech.md v1.39)', () => {
	it('is the unpaid rest of a request and never goes below zero', () => {
		assertProperty(
			fc.property(minor, marks, (total, paid) => {
				const debt = requestDebtMinor(total, paid);
				return debt >= 0 && debt === Math.max(0, total - sum(paid));
			})
		);
	});

	it('never grows when one more payment mark arrives', () => {
		assertProperty(
			fc.property(minor, marks, fc.integer({ min: 1, max: 1_000_000_00 }), (total, paid, extra) => {
				return requestDebtMinor(total, [...paid, extra]) <= requestDebtMinor(total, paid);
			})
		);
	});

	it('counts only what was handed over and not paid for', () => {
		assertProperty(
			fc.property(fc.array(request, { maxLength: 30 }), (requests) => {
				const open = requests.filter((row) =>
					(DEBT_STATUSES as readonly string[]).includes(row.status)
				);
				const debt = counterpartyDebt(requests);
				const rests = open.map((row) => requestDebtMinor(row.totalMinor, row.marksMinor));
				return (
					debt.debtMinor === sum(rests) &&
					debt.openCount === rests.filter((rest) => rest > 0).length
				);
			})
		);
	});

	it('clears a request once its marks cover the total', () => {
		assertProperty(fc.property(minor, (total) => requestDebtMinor(total, [total]) === 0));
		expect(counterpartyDebt([])).toEqual({ debtMinor: 0, openCount: 0 });
	});
});
