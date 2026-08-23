export const EVENT_KEYS = [
	'request.submitted',
	'request.accepted',
	'request.ready',
	'request.delivered',
	'request.delivery_failed',
	'request.cancelled',
	'request.rejected',
	'request.payment_marked',
	'request.paid',
	'stock.below_threshold',
	'payroll.week_closed'
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];
