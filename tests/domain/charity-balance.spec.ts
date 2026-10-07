import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	fitsRemainder,
	fundRemainderMinor,
	isTransferReversible
} from '../../src/lib/domain/charity/balance';

describe('fund balance (C13)', () => {
	it('returns to the same remainder after a reversal', () => {
		fc.assert(
			fc.property(
				fc.nat(1e9),
				fc.array(fc.integer({ min: 1, max: 1e6 })),
				fc.integer({ min: 1, max: 1e6 }),
				(accrued, sent, amount) => {
					const before = fundRemainderMinor(accrued, sent);
					expect(fundRemainderMinor(accrued, [...sent, amount, -amount])).toBe(before);
					expect(before).toBe(accrued - sent.reduce((sum, value) => sum + value, 0));
				}
			)
		);
	});

	it('takes exactly the remainder and not a kopeck more', () => {
		expect(fitsRemainder(500, 500)).toBe(true);
		expect(fitsRemainder(500, 501)).toBe(false);
		expect(fitsRemainder(500, 0)).toBe(false);
		expect(fitsRemainder(-10, 1)).toBe(false);
	});

	it('reverses a plain transfer once', () => {
		expect(isTransferReversible({ reversalOfId: null, isReversed: false })).toBe(true);
		expect(isTransferReversible({ reversalOfId: null, isReversed: true })).toBe(false);
		expect(isTransferReversible({ reversalOfId: 3, isReversed: false })).toBe(false);
	});
});
