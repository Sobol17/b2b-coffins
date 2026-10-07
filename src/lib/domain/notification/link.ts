import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';

/** Who reads the event: a portal person, a workshop person with the registry, or one without it. */
export type Audience = 'portal' | 'crm_registry' | 'crm_floor';

/** Path of the screen an event opens (tech.md 7.3). The server checks the right there again. */
export function eventPath(
	eventKey: EventKey,
	entityId: number,
	audience: Audience,
	weekStart?: string
): string {
	if (REQUEST_EVENT_KEYS.includes(eventKey)) {
		if (audience === 'portal') return `/portal/requests/${entityId}`;
		return audience === 'crm_registry' ? `/crm/requests/${entityId}` : '/crm/delivery';
	}
	if (eventKey === 'stock.below_threshold') return `/crm/stock/${entityId}`;
	return weekStart === undefined ? '/crm/payroll' : `/crm/payroll?week=${weekStart}`;
}
