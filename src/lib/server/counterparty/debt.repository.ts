import { and, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { counterparties, paymentMarks, requests } from '../db/schema';
import { DEBT_STATUSES, type Debt } from '$lib/domain/payment/debt';

const NO_DEBT: Debt = { debtMinor: 0, openCount: 0 };

/**
 * SQL twin of `counterpartyDebt` in domain/payment/debt.ts, the one debt query of the portal (P2)
 * and the CRM (C3). It reads the payment marks, not `requests.paid_minor`, so the indicator always
 * agrees with the registry of marks the card shows next to it (tech.md v1.39).
 */
export class DebtRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	of(counterpartyId: number, tx?: Tx): Debt {
		return this.byCounterparty([counterpartyId], tx).get(counterpartyId) ?? NO_DEBT;
	}

	/** Debt of every listed counterparty; one without an open request is simply absent. */
	byCounterparty(counterpartyIds: readonly number[], tx?: Tx): Map<number, Debt> {
		if (counterpartyIds.length === 0) return new Map();
		const { paid, rest } = this.rest(tx);
		const rows = this.db(tx)
			.select({
				counterpartyId: requests.counterpartyId,
				debtMinor: sql<number>`coalesce(sum(${rest}), 0)`,
				openCount: sql<number>`coalesce(sum(case when ${rest} > 0 then 1 else 0 end), 0)`
			})
			.from(requests)
			.leftJoin(paid, eq(paid.requestId, requests.id))
			.where(
				and(
					inArray(requests.status, [...DEBT_STATUSES]),
					inArray(requests.counterpartyId, [...counterpartyIds])
				)
			)
			.groupBy(requests.counterpartyId)
			.all();
		const debts = new Map<number, Debt>();
		for (const row of rows) {
			if (row.counterpartyId === null) continue;
			debts.set(row.counterpartyId, { debtMinor: row.debtMinor, openCount: row.openCount });
		}
		return debts;
	}

	/** `counterparties.id` of those who owe something: the "with debt" filter of the registry. */
	debtorsWhere(tx?: Tx): SQL {
		const { paid, rest } = this.rest(tx);
		const debtors = this.db(tx)
			.select({ id: requests.counterpartyId })
			.from(requests)
			.leftJoin(paid, eq(paid.requestId, requests.id))
			.where(and(inArray(requests.status, [...DEBT_STATUSES]), gt(rest, 0)));
		return inArray(counterparties.id, debtors);
	}

	private rest(tx?: Tx) {
		const paid = this.db(tx)
			.select({
				requestId: paymentMarks.requestId,
				marksMinor: sql<number>`sum(${paymentMarks.amountMinor})`.as('marks_minor')
			})
			.from(paymentMarks)
			.groupBy(paymentMarks.requestId)
			.as('paid');
		// The alias differs from requests.paid_minor: Drizzle writes it unqualified. Two-argument max()
		// is the scalar one in SQLite, so an overpaid request owes zero, not less.
		const rest = sql<number>`max(0, ${requests.totalMinor} - coalesce(${paid.marksMinor}, 0))`;
		return { paid, rest };
	}
}
