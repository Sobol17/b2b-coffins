export const EVENT_KEYS = [
	'request.submitted',
	'request.accepted',
	'request.ready',
	'request.delivered',
	'request.cancelled',
	'request.rejected',
	'request.payment_marked',
	'request.paid',
	'stock.below_threshold',
	'payroll.week_closed',
	// Counterparty questions (tech.md 7.3, v1.57). A message event carries the message id.
	'support.opened',
	'support.message_posted',
	'support.closed',
	// A visit of a request to a station (tech.md 7.3, §20.4): the entity is the visit, not the request.
	'shop.task_arrived'
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

/** Events whose `entityId` is a request id (tech.md 7.3): the feed links only these to a card. */
export const REQUEST_EVENT_KEYS = EVENT_KEYS.filter((key) =>
	key.startsWith('request.')
) as readonly EventKey[];

/** Events of a support thread: the feed and the push lead them to the thread, not to a request. */
export const SUPPORT_EVENT_KEYS = EVENT_KEYS.filter((key) =>
	key.startsWith('support.')
) as readonly EventKey[];

/** Events of a shop visit: the feed and the push lead them to the visit on its station. */
export const SHOP_EVENT_KEYS = EVENT_KEYS.filter((key) =>
	key.startsWith('shop.')
) as readonly EventKey[];
