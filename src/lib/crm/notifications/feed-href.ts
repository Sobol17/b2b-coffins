import { resolve } from '$app/paths';
import type { FeedHref } from '$lib/notifications/labels';
import { SHOP_EVENT_KEYS, SUPPORT_EVENT_KEYS } from '$lib/types/events';

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
		if (SUPPORT_EVENT_KEYS.includes(item.eventKey)) return resolve(`/crm/support/${item.entityId}`);
		if (SHOP_EVENT_KEYS.includes(item.eventKey)) return resolve(`/crm/shop/${item.entityId}`);
		return item.eventKey === 'stock.below_threshold'
			? resolve(`/crm/stock/${item.entityId}`)
			: resolve('/crm/payroll');
	};
}
