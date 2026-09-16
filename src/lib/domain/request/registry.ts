import { endOfDayInZone, startOfDayInZone } from '../time/zone';
import { REQUEST_SORTS, type RequestFilters, type RequestSort } from '$lib/types/request';
import type { RequestStatus } from '$lib/types/request';

/** The request is still moving: it sits between the sent state and the closing one (tech.md 6.1). */
export const ACTIVE_STATUSES: readonly RequestStatus[] = [
	'new',
	'in_work',
	'ready',
	'delivered',
	'awaiting_payment'
];

/** Nothing moves any more: the flow ended in payment, or the request left it (tech.md 6.2). */
export const CLOSED_STATUSES: readonly RequestStatus[] = ['paid', 'cancelled', 'rejected'];

const DEFAULT_SORT: RequestSort = 'submittedAt';

/**
 * The sort the registry may honour. A role without prices never sorts by money: the order of the
 * rows would tell the amounts apart even though no amount is printed (tech.md 8.1).
 */
export function sortFor(sort: string | undefined, canSeePrices: boolean): RequestSort {
	const known = REQUEST_SORTS.find((candidate) => candidate === sort);
	if (known === undefined) return DEFAULT_SORT;
	return known === 'total' && !canSeePrices ? DEFAULT_SORT : known;
}

export interface DateWindow {
	readonly from?: Date;
	readonly to?: Date;
}

/** Closed window over `submittedAt`. A date the calendar does not have drops out of the filter. */
export function dateWindow(
	range: Pick<RequestFilters, 'from' | 'to'>,
	timeZone: string
): DateWindow {
	const from = range.from === undefined ? null : startOfDayInZone(range.from, timeZone);
	const to = range.to === undefined ? null : endOfDayInZone(range.to, timeZone);
	return {
		...(from === null ? {} : { from }),
		...(to === null ? {} : { to })
	};
}
