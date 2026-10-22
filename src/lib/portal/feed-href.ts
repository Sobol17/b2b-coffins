import { resolve } from '$app/paths';
import type { FeedHref } from '$lib/notifications/labels';
import { SUPPORT_EVENT_KEYS } from '$lib/types/events';

/**
 * A portal feed line leads to the card of its request or to its support thread (v1.57); a row
 * outside the fence stays plain.
 */
export const portalFeedHref: FeedHref = (item) => {
	if (item.requestId !== null) return resolve(`/portal/requests/${item.requestId}`);
	if (SUPPORT_EVENT_KEYS.includes(item.eventKey) && item.entityId !== null) {
		return resolve(`/portal/support/${item.entityId}`);
	}
	return null;
};
