import { resolve } from '$app/paths';
import type { FeedHref } from '$lib/notifications/labels';

/**
 * Where a workshop feed line leads (tech.md v1.49). A reader without the registry, the driver,
 * meets a request on the delivery screen; the server checks the right again on every page.
 */
export function crmFeedHref(canReadRequests: boolean): FeedHref {
	return (item) => {
		if (item.requestId !== null) {
			return canReadRequests
				? resolve(`/crm/requests/${item.requestId}`)
				: resolve('/crm/delivery');
		}
		if (item.entityId === null) return null;
		return item.eventKey === 'stock.below_threshold'
			? resolve(`/crm/stock/${item.entityId}`)
			: resolve('/crm/payroll');
	};
}
