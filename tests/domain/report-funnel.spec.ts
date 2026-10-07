import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { funnelShares } from '../../src/lib/domain/report/funnel';

const falling = fc
	.array(fc.nat(1000), { minLength: 5, maxLength: 5 })
	.map((steps) =>
		steps.reduce<number[]>((acc, step) => [...acc, Math.max(0, (acc.at(-1) ?? 5000) - step)], [])
	);

describe('funnel shares (C13)', () => {
	it('counts shares in basis points', () => {
		expect(funnelShares([10, 8, 4, 4, 1])).toEqual([
			{ shareOfPreviousBp: null, shareOfFirstBp: 10_000 },
			{ shareOfPreviousBp: 8000, shareOfFirstBp: 8000 },
			{ shareOfPreviousBp: 5000, shareOfFirstBp: 4000 },
			{ shareOfPreviousBp: 10_000, shareOfFirstBp: 4000 },
			{ shareOfPreviousBp: 2500, shareOfFirstBp: 1000 }
		]);
	});

	it('has no share of an empty stage', () => {
		expect(funnelShares([0, 0])).toEqual([
			{ shareOfPreviousBp: null, shareOfFirstBp: null },
			{ shareOfPreviousBp: null, shareOfFirstBp: null }
		]);
	});

	it('stays within 0..10000 while the counts do not grow', () => {
		fc.assert(
			fc.property(falling, (counts) => {
				for (const share of funnelShares(counts)) {
					for (const bp of [share.shareOfPreviousBp, share.shareOfFirstBp]) {
						if (bp !== null) expect(bp >= 0 && bp <= 10_000).toBe(true);
					}
				}
			})
		);
	});
});
