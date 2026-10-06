import { resolve } from '$app/paths';
import type { FeedHref } from '$lib/notifications/labels';

/** A portal feed line leads to the card of its request; a row outside the fence stays plain. */
export const portalFeedHref: FeedHref = (item) =>
	item.requestId === null ? null : resolve(`/portal/requests/${item.requestId}`);
