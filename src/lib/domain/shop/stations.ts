import { WORK_ROLES, type WorkRole } from '$lib/types/roles';

/** The station a piece goes to after this one; null after the upholsterer, where it meets the shelf. */
export function nextStation(station: WorkRole): WorkRole | null {
	return WORK_ROLES[WORK_ROLES.indexOf(station) + 1] ?? null;
}

/** What orders the visits on a station: the request behind the visit, and the visit id last. */
export interface StationOrderFacts {
	readonly id: number;
	readonly isUrgent: boolean;
	readonly deliveryAt: Date | null;
	readonly acceptedAt: Date | null;
}

/** Urgent first, then the nearest deadline, a visit without one after the rest, then acceptance. */
export function stationOrder(a: StationOrderFacts, b: StationOrderFacts): number {
	return (
		Number(b.isUrgent) - Number(a.isUrgent) ||
		rank(a.deliveryAt) - rank(b.deliveryAt) ||
		rank(a.acceptedAt) - rank(b.acceptedAt) ||
		a.id - b.id
	);
}

function rank(at: Date | null): number {
	return at === null ? Number.POSITIVE_INFINITY : at.getTime();
}
