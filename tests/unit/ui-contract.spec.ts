import { describe, expect, it } from 'vitest';
import { buttonVariants } from '../../src/lib/ui/base/button/button.svelte';
import { REQUEST_STATUS_FLOW, REQUEST_STATUS_META, TONE_CLASS } from '../../src/lib/ui/status';
import { REQUEST_STATUSES } from '../../src/lib/types/request';
import { PRICE_DASH, formatMinor } from '../../src/lib/utils/format';

describe('the kit renders every primitive from the contract', () => {
	it('takes the status palette and caption from one dictionary', () => {
		expect(Object.keys(REQUEST_STATUS_META).sort()).toEqual([...REQUEST_STATUSES].sort());
		for (const status of REQUEST_STATUSES) {
			const meta = REQUEST_STATUS_META[status];
			expect(meta.label).not.toBe('');
			expect(TONE_CLASS[meta.tone]).toContain('bg-tone-');
		}
	});

	it('offers the four button variants and the four sizes of the core file', () => {
		for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
			expect(buttonVariants({ variant })).toContain('inline-flex');
		}
		for (const size of ['sm', 'md', 'lg', 'touch'] as const) {
			expect(buttonVariants({ size })).toContain('inline-flex');
		}
	});

	it('keeps the touch target no smaller than 44 px', () => {
		const touch = buttonVariants({ size: 'touch' });
		expect(touch).toContain('min-h-touch');
		expect(touch).toContain('min-w-touch');
	});

	it('walks the stepper along the main flow of the transition table', () => {
		expect(REQUEST_STATUS_FLOW).toEqual([
			'draft',
			'new',
			'in_work',
			'ready',
			'delivered',
			'awaiting_payment',
			'paid'
		]);
		expect(REQUEST_STATUS_FLOW).not.toContain('cancelled');
		expect(REQUEST_STATUS_FLOW).not.toContain('rejected');
	});

	it('draws a dash when the price did not arrive', () => {
		expect(formatMinor(undefined)).toBe(PRICE_DASH);
		expect(formatMinor(null)).toBe(PRICE_DASH);
		expect(formatMinor(0)).not.toBe(PRICE_DASH);
	});
});
