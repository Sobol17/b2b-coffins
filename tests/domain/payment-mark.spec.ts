import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { requestDebtMinor } from '../../src/lib/domain/payment/debt';
import {
	acceptsPayment,
	isReversible,
	settledAmountMinor
} from '../../src/lib/domain/payment/mark';
import { REQUEST_STATUSES } from '../../src/lib/types/request';
import { roundHalfUp } from '../../src/lib/utils/money';

const due = fc.integer({ min: 1, max: 5_000_000_00 });
/** What the form sends: whole rubles. */
const entered = fc.integer({ min: 1, max: 6_000_000 }).map((rubles) => rubles * 100);
const status = fc.constantFrom(...REQUEST_STATUSES);

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('amount of a payment mark (tech.md v1.44)', () => {
	it('never writes more than the rest: there is no overpayment', () => {
		assertProperty(
			fc.property(due, entered, (rest, amount) => {
				const verdict = settledAmountMinor(rest, amount);
				return !verdict.ok || (verdict.amountMinor > 0 && verdict.amountMinor <= rest);
			})
		);
	});

	it('closes the request to the kopeck when the rest is typed the way the screen shows it', () => {
		assertProperty(
			fc.property(due, (rest) => {
				const shown = Math.max(1, roundHalfUp(rest / 100)) * 100;
				const verdict = settledAmountMinor(rest, shown);
				return verdict.ok && requestDebtMinor(rest, [verdict.amountMinor]) === 0;
			})
		);
	});

	it('keeps a partial amount as typed and leaves a rest of a ruble or more', () => {
		assertProperty(
			fc.property(due, entered, (rest, amount) => {
				fc.pre(amount <= rest - 100);
				const verdict = settledAmountMinor(rest, amount);
				return verdict.ok && verdict.amountMinor === amount && rest - verdict.amountMinor >= 100;
			})
		);
	});

	it('refuses an amount a ruble or more above the rest, and any amount when nothing is due', () => {
		assertProperty(
			fc.property(due, entered, (rest, amount) => {
				fc.pre(amount >= rest + 100);
				return settledAmountMinor(rest, amount).ok === false;
			})
		);
		expect(settledAmountMinor(0, 100)).toEqual({ ok: false, refusal: 'nothing_due' });
		expect(settledAmountMinor(500_40, 700_00)).toEqual({ ok: false, refusal: 'overpayment' });
		expect(settledAmountMinor(500_40, 500_00)).toEqual({ ok: true, amountMinor: 500_40 });
	});

	it('takes money only for a delivered counterparty request', () => {
		assertProperty(
			fc.property(status, fc.boolean(), (at, isStock) => {
				return acceptsPayment(at, isStock) === (at === 'awaiting_payment' && !isStock);
			})
		);
	});

	it('cancels a mark once, never a reversal, and only while the request waits for money', () => {
		assertProperty(
			fc.property(status, fc.boolean(), fc.boolean(), (at, isReversal, isReversed) => {
				const mark = { reversalOfId: isReversal ? 1 : null, isReversed };
				const expected = at === 'awaiting_payment' && !isReversal && !isReversed;
				return isReversible(mark, at) === expected;
			})
		);
	});
});
