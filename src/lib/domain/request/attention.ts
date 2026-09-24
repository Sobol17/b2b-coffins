import type { SettlementScheme } from '$lib/types/counterparty';
import type { AttentionFlag } from '$lib/types/crm-request';
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
	readonly deliveredAt: Date | null;
	/** Null for a stock request: nobody owes the workshop for its own stock. */
	readonly scheme: SettlementScheme | null;
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
	if (paymentOverdue(facts, now)) flags.push('payment_overdue');
	return flags;
}
