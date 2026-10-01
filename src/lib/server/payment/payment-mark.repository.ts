import { desc, eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { paymentMarks, requests, users } from '../db/schema';
import type { PaymentMethod } from '$lib/types/crm-counterparty';

export interface PaymentMarkRow {
	readonly id: number;
	readonly requestId: number;
	readonly requestNumber: string;
	readonly amountMinor: number;
	readonly paidAt: Date;
	readonly method: PaymentMethod;
	readonly comment: string | null;
	readonly createdByName: string;
	readonly reversalOfId: number | null;
	readonly isReversed: boolean;
}

export interface NewPaymentMark {
	readonly requestId: number;
	readonly amountMinor: number;
	readonly paidAt: Date;
	readonly method: PaymentMethod;
	readonly comment: string | null;
	readonly createdById: number;
	readonly reversalOfId?: number;
}

const IS_REVERSED = sql<number>`exists (select 1 from payment_marks as undo where undo.reversal_of_id = ${paymentMarks.id})`;

/** One shape of a mark for the request card and the counterparty registry (C3, C7). */
export const MARK_COLUMNS = {
	id: paymentMarks.id,
	requestId: paymentMarks.requestId,
	requestNumber: requests.number,
	amountMinor: paymentMarks.amountMinor,
	paidAt: paymentMarks.paidAt,
	method: paymentMarks.method,
	comment: paymentMarks.comment,
	createdByName: users.fullName,
	reversalOfId: paymentMarks.reversalOfId,
	isReversed: IS_REVERSED.mapWith(Boolean)
};

/** Payment marks of a request: an append-only registry, a mistake is cancelled by a reversal row. */
export class PaymentMarkRepository extends BaseRepository<typeof paymentMarks> {
	constructor() {
		super(paymentMarks);
	}

	/** Newest first, reversals included: the card shows the registry as it was written. */
	ofRequest(requestId: number, tx?: Tx): PaymentMarkRow[] {
		return this.db(tx)
			.select(MARK_COLUMNS)
			.from(paymentMarks)
			.innerJoin(requests, eq(requests.id, paymentMarks.requestId))
			.innerJoin(users, eq(users.id, paymentMarks.createdById))
			.where(eq(paymentMarks.requestId, requestId))
			.orderBy(desc(paymentMarks.paidAt), desc(paymentMarks.id))
			.all();
	}

	find(id: number, tx?: Tx): PaymentMarkRow | undefined {
		const [row] = this.db(tx)
			.select(MARK_COLUMNS)
			.from(paymentMarks)
			.innerJoin(requests, eq(requests.id, paymentMarks.requestId))
			.innerJoin(users, eq(users.id, paymentMarks.createdById))
			.where(eq(paymentMarks.id, id))
			.all();
		return row;
	}

	/** Signed amounts: a reversal carries the negated amount of the mark it cancels. */
	amounts(requestId: number, tx?: Tx): number[] {
		return this.db(tx)
			.select({ amount: paymentMarks.amountMinor })
			.from(paymentMarks)
			.where(eq(paymentMarks.requestId, requestId))
			.all()
			.map((mark) => mark.amount);
	}

	insert(mark: NewPaymentMark, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(paymentMarks)
			.values(mark)
			.returning({ id: paymentMarks.id })
			.all();
		if (!row) throw new Error('failed to write a payment mark');
		return row.id;
	}

	/**
	 * `requests.paid_minor` follows the marks in the transaction that changed them, so the portal
	 * card and the registries read one number (tech.md v1.44). The debt still counts the marks.
	 */
	syncPaid(requestId: number, tx: Tx): void {
		this.db(tx)
			.update(requests)
			.set({
				paidMinor: sql`coalesce((select sum(${paymentMarks.amountMinor}) from ${paymentMarks} where ${paymentMarks.requestId} = ${requestId}), 0)`
			})
			.where(eq(requests.id, requestId))
			.run();
	}
}
