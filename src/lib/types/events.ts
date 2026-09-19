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
	'payroll.week_closed'
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

/** Events whose `entityId` is a request id (tech.md 7.3): the feed links only these to a card. */
export const REQUEST_EVENT_KEYS = EVENT_KEYS.filter((key) =>
	key.startsWith('request.')
) as readonly EventKey[];
