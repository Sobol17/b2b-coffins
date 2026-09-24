import { and, eq, gte, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { containsText } from '../core/search';
import { counterparties, requests } from '../db/schema';
import { paymentDueBefore } from '$lib/domain/request/attention';
import type { DateWindow } from '$lib/domain/request/registry';
import type { SettlementScheme } from '$lib/types/counterparty';
import type { AttentionFlag, CrmRequestFilters } from '$lib/types/crm-request';

const SCHEMES: readonly SettlementScheme[] = ['on_fact', 'weekly', 'monthly'];

/** What the registry, the board and the export filter by, already read from the query string. */
export interface CrmRequestCriteria {
	readonly filters: Omit<CrmRequestFilters, 'from' | 'to'>;
	readonly window: DateWindow;
	readonly search: string | undefined;
	/** The clock of the attention flags, so the SQL and `attentionFlags` agree on one moment. */
	readonly now: Date;
}

/**
 * The SQL twin of `attentionFlags` (tech.md v1.40). The unit tests hold both against each other,
 * because a flag the board shows must also be the one the filter finds.
 */
export function flagWhere(flag: AttentionFlag, now: Date): SQL | undefined {
	return and(
		eq(requests.status, 'awaiting_payment'),
		or(
			...SCHEMES.map((scheme) =>
				and(
					eq(counterparties.settlementScheme, scheme),
					lte(requests.deliveredAt, paymentDueBefore(scheme, now))
				)
			)
		)
	);
}

function searchWhere(search: string | undefined): SQL | undefined {
	const text = search?.trim() ?? '';
	if (text === '') return undefined;
	return or(
		containsText(requests.number, text),
		containsText(requests.externalNumber, text),
		containsText(counterparties.name, text),
		containsText(requests.deceasedName, text)
	);
}

/** Every workshop list starts where the request was sent: the draft is the counterparty's cart. */
export function criteriaWhere(criteria: CrmRequestCriteria): SQL | undefined {
	const { filters, window } = criteria;
	return and(
		ne(requests.status, 'draft'),
		filters.status === undefined ? undefined : eq(requests.status, filters.status),
		filters.counterpartyId === undefined
			? undefined
			: eq(requests.counterpartyId, filters.counterpartyId),
		filters.stockOnly === true ? eq(requests.isStockRequest, true) : undefined,
		filters.priority === undefined ? undefined : eq(requests.priority, filters.priority),
		filters.flag === undefined ? undefined : flagWhere(filters.flag, criteria.now),
		window.from === undefined ? undefined : gte(requests.submittedAt, window.from),
		window.to === undefined ? undefined : lte(requests.submittedAt, window.to),
		searchWhere(criteria.search)
	);
}

/** Urgent first, then the nearest deadline; a request without a deadline goes last. */
export const BOARD_ORDER = [
	sql`case when ${requests.priority} = ${'urgent'} then 0 else 1 end`,
	sql`${requests.deliveryAt} is null`,
	requests.deliveryAt,
	requests.id
];
