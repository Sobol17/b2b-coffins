import type { SettlementScheme } from '$lib/types/counterparty';
import type { AssigneeRole, AttentionFlag } from '$lib/types/crm-request';
import type { RequestStatus } from '$lib/types/request';

const DAY_MS = 86_400_000;

/**
 * Days a delivered request may wait for its money before the board flags it (tech.md v1.40). A
 * counterparty that settles monthly pays late by agreement, so one clock for all would only cry wolf.
 */
export const PAYMENT_WAIT_DAYS: Readonly<Record<SettlementScheme, number>> = {
	on_fact: 3,
	weekly: 7,
	monthly: 30
};

export interface AttentionFacts {
	readonly status: RequestStatus;
	readonly assigneeRoles: readonly AssigneeRole[];
	readonly deliveredAt: Date | null;
	/** Null for a stock request: nobody owes the workshop for its own stock. */
	readonly scheme: SettlementScheme | null;
}

/** Before the product is made anybody on the crew will do; a finished one needs a driver. */
export function lacksAssignee(status: RequestStatus, roles: readonly AssigneeRole[]): boolean {
	if (status === 'new' || status === 'in_work') return roles.length === 0;
	if (status === 'ready') return !roles.includes('driver');
	return false;
}

/** The last delivery moment that is already overdue for a scheme, as of `now`. */
export function paymentDueBefore(scheme: SettlementScheme, now: Date): Date {
	return new Date(now.getTime() - PAYMENT_WAIT_DAYS[scheme] * DAY_MS);
}

export function paymentOverdue(facts: AttentionFacts, now: Date): boolean {
	if (facts.status !== 'awaiting_payment' || facts.scheme === null) return false;
	if (facts.deliveredAt === null) return false;
	return facts.deliveredAt.getTime() <= paymentDueBefore(facts.scheme, now).getTime();
}

/** Flags of the board and the registry. The SQL filter of the registry follows the same rules. */
export function attentionFlags(facts: AttentionFacts, now: Date): AttentionFlag[] {
	const flags: AttentionFlag[] = [];
	if (lacksAssignee(facts.status, facts.assigneeRoles)) flags.push('no_assignee');
	if (paymentOverdue(facts, now)) flags.push('payment_overdue');
	return flags;
}
