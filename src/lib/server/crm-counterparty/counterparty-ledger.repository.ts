import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { paymentMarks, requests, users } from '../db/schema';
import type { RegistryRow } from '../request/request-registry.repository';
import type { PaymentMethod } from '$lib/types/crm-counterparty';
import type { ListQuery } from '$lib/types/list';

export interface PaymentMarkRow {
	readonly id: number;
	readonly requestId: number;
	readonly requestNumber: string;
	readonly amountMinor: number;
	readonly paidAt: Date;
	readonly method: PaymentMethod;
	readonly comment: string | null;
	readonly createdByName: string;
}

const BASE_COLUMNS = {
	id: requests.id,
	number: requests.number,
	status: requests.status,
	priority: requests.priority,
	externalNumber: requests.externalNumber,
	authorName: users.fullName,
	createdAt: requests.createdAt,
	submittedAt: requests.submittedAt,
	readyAt: requests.readyAt,
	deliveredAt: requests.deliveredAt
};

// Paid is read from the marks, like the debt: the card must not show two answers to one question.
const MONEY_COLUMNS = {
	totalMinor: requests.totalMinor,
	paidMinor: sql<number>`coalesce((select sum(${paymentMarks.amountMinor}) from ${paymentMarks} where ${paymentMarks.requestId} = ${requests.id}), 0)`
};

/** Request history and payment marks of one counterparty for the workshop card (C3). */
export class CounterpartyLedgerRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/** Sent requests, newest first. A draft is the counterparty's cart, not history. */
	requests(
		counterpartyId: number,
		query: ListQuery<unknown>,
		withMoney: boolean
	): { rows: RegistryRow[]; total: number } {
		const where = and(eq(requests.counterpartyId, counterpartyId), ne(requests.status, 'draft'));
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(requests)
			.where(where)
			.all();
		const rows = this.db()
			.select(withMoney ? { ...BASE_COLUMNS, ...MONEY_COLUMNS } : BASE_COLUMNS)
			.from(requests)
			.leftJoin(users, eq(users.id, requests.createdById))
			.where(where)
			.orderBy(desc(requests.submittedAt), desc(requests.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	/** The registry of payment marks the debt indicator is checked against, newest first. */
	payments(
		counterpartyId: number,
		query: ListQuery<unknown>
	): { rows: PaymentMarkRow[]; total: number } {
		const where = eq(requests.counterpartyId, counterpartyId);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(paymentMarks)
			.innerJoin(requests, eq(requests.id, paymentMarks.requestId))
			.where(where)
			.all();
		const rows = this.db()
			.select({
				id: paymentMarks.id,
				requestId: paymentMarks.requestId,
				requestNumber: requests.number,
				amountMinor: paymentMarks.amountMinor,
				paidAt: paymentMarks.paidAt,
				method: paymentMarks.method,
				comment: paymentMarks.comment,
				createdByName: users.fullName
			})
			.from(paymentMarks)
			.innerJoin(requests, eq(requests.id, paymentMarks.requestId))
			.innerJoin(users, eq(users.id, paymentMarks.createdById))
			.where(where)
			.orderBy(desc(paymentMarks.paidAt), desc(paymentMarks.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}
}
