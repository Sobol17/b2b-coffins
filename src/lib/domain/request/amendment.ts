import type { RequestTotals } from './pricing';
import type { ItemsEditMode } from '$lib/types/crm-request';
import type { RequestStatus } from '$lib/types/request';

/**
 * How the lines of a request may change (tech.md v1.40). Before the acceptance nothing is fixed yet;
 * once the crew works on it, a change keeps the prices and leaves a trace; a made product is closed.
 */
export function itemsEditMode(status: RequestStatus): ItemsEditMode {
	if (status === 'new') return 'free';
	if (status === 'in_work') return 'controlled';
	return 'closed';
}

/** The request left the hands of the manager: from here on every change is written to history. */
export function isLaunched(status: RequestStatus): boolean {
	return status !== 'draft' && status !== 'new';
}

/** Statuses in which the crew and the priority of a request may still change. */
export const STEERABLE_STATUSES: readonly RequestStatus[] = ['new', 'in_work', 'ready'];

export function isSteerable(status: RequestStatus): boolean {
	return STEERABLE_STATUSES.includes(status);
}

/**
 * Totals after a change of an accepted request. The discount keeps the share it had at acceptance:
 * the rate was agreed on the whole order, and today's rules must not move it.
 * @throws RangeError for a negative or fractional items total.
 */
export function keepDiscountShare(before: RequestTotals, itemsTotalMinor: number): RequestTotals {
	if (!Number.isInteger(itemsTotalMinor) || itemsTotalMinor < 0) {
		throw new RangeError(`items total must be a non-negative integer: ${itemsTotalMinor}`);
	}
	const discountMinor =
		before.itemsTotalMinor <= 0
			? 0
			: Math.min(
					itemsTotalMinor,
					shareHalfUp(before.discountMinor, itemsTotalMinor, before.itemsTotalMinor)
				);
	return { itemsTotalMinor, discountMinor, totalMinor: itemsTotalMinor - discountMinor };
}

/**
 * `part * whole / of`, rounded half up. BigInt, because two ruble sums in kopecks multiplied run past
 * the exact range of a double long before a coffin order gets unusual.
 */
function shareHalfUp(part: number, whole: number, of: number): number {
	const numerator = BigInt(Math.max(0, part)) * BigInt(whole) * 2n + BigInt(of);
	return Number(numerator / (2n * BigInt(of)));
}
