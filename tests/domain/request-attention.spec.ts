import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	PAYMENT_WAIT_DAYS,
	attentionFlags,
	paymentDueBefore
} from '../../src/lib/domain/request/attention';
import { REQUEST_STATUSES } from '../../src/lib/types/request';

const DAY_MS = 86_400_000;
const now = new Date('2026-09-24T12:00:00Z');
const schemes = fc.constantFrom('on_fact' as const, 'weekly' as const, 'monthly' as const);

function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('the flag of a long wait for payment (C4)', () => {
	it('raises exactly when the wait of the scheme is over', () => {
		assertProperty(
			fc.property(schemes, fc.integer({ min: 0, max: 60 }), (scheme, days) => {
				const deliveredAt = new Date(now.getTime() - days * DAY_MS);
				const flags = attentionFlags({ status: 'awaiting_payment', deliveredAt, scheme }, now);
				return flags.includes('payment_overdue') === days >= PAYMENT_WAIT_DAYS[scheme];
			})
		);
	});

	it('waits longer for a monthly counterparty than for one that pays on delivery', () => {
		expect(paymentDueBefore('monthly', now).getTime()).toBeLessThan(
			paymentDueBefore('on_fact', now).getTime()
		);
	});

	it('never raises for a stock request or outside awaiting payment', () => {
		const long = new Date(now.getTime() - 90 * DAY_MS);
		assertProperty(
			fc.property(fc.constantFrom(...REQUEST_STATUSES), schemes, (status, scheme) => {
				const stock = attentionFlags({ status, deliveredAt: long, scheme: null }, now);
				const other = attentionFlags({ status, deliveredAt: long, scheme }, now);
				return (
					!stock.includes('payment_overdue') &&
					other.includes('payment_overdue') === (status === 'awaiting_payment')
				);
			})
		);
	});

	it('does not raise before the delivery moment is known', () => {
		expect(
			attentionFlags({ status: 'awaiting_payment', deliveredAt: null, scheme: 'on_fact' }, now)
		).toEqual([]);
	});
});
