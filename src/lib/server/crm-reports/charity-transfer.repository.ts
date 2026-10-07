import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { charityTransfers, counterparties, users } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import type { ListQuery } from '$lib/types/list';

export interface TransferRow {
	readonly id: number;
	readonly amountMinor: number;
	readonly transferredAt: Date;
	readonly documentRef: string | null;
	readonly comment: string | null;
	readonly createdByName: string;
	readonly createdAt: Date;
	readonly reversalOfId: number | null;
	readonly isReversed: boolean;
}
export interface NewTransfer {
	readonly amountMinor: number;
	readonly transferredAt: Date;
	readonly documentRef: string | null;
	readonly comment: string | null;
	readonly createdById: number;
	readonly reversalOfId?: number;
}

const IS_REVERSED = sql<number>`exists (select 1 from charity_transfers as undo where undo.reversal_of_id = ${charityTransfers.id})`;
const COLUMNS = {
	id: charityTransfers.id,
	amountMinor: charityTransfers.amountMinor,
	transferredAt: charityTransfers.transferredAt,
	documentRef: charityTransfers.documentRef,
	comment: charityTransfers.comment,
	createdByName: users.fullName,
	createdAt: charityTransfers.createdAt,
	reversalOfId: charityTransfers.reversalOfId,
	isReversed: IS_REVERSED.mapWith(Boolean)
};

/** Transfers to the fund: an append-only registry, a mistake is cancelled by a reversal row. */
export class CharityTransferRepository extends BaseRepository<typeof charityTransfers> {
	constructor() {
		super(charityTransfers);
	}

	private within(window: ReportWindow) {
		return and(
			gte(charityTransfers.transferredAt, window.from),
			lt(charityTransfers.transferredAt, window.to)
		);
	}

	find(id: number, tx?: Tx): TransferRow | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(charityTransfers)
			.innerJoin(users, eq(users.id, charityTransfers.createdById))
			.where(eq(charityTransfers.id, id))
			.all();
		return row;
	}

	/** Signed amounts of the whole registry: a reversal carries the negated amount. */
	amounts(tx?: Tx): number[] {
		return this.db(tx)
			.select({ amount: charityTransfers.amountMinor })
			.from(charityTransfers)
			.all()
			.map((row) => row.amount);
	}

	sumWithin(window: ReportWindow): number {
		const [row] = this.db()
			.select({ sum: sql<number>`coalesce(sum(${charityTransfers.amountMinor}), 0)` })
			.from(charityTransfers)
			.where(this.within(window))
			.all();
		return row?.sum ?? 0;
	}

	page(window: ReportWindow, query: ListQuery<unknown>): { rows: TransferRow[]; total: number } {
		const rows = this.db()
			.select(COLUMNS)
			.from(charityTransfers)
			.innerJoin(users, eq(users.id, charityTransfers.createdById))
			.where(this.within(window))
			.orderBy(desc(charityTransfers.transferredAt), desc(charityTransfers.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		const [count] = this.db()
			.select({ total: countExpression })
			.from(charityTransfers)
			.where(this.within(window))
			.all();
		return { rows, total: count?.total ?? 0 };
	}

	insert(transfer: NewTransfer, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(charityTransfers)
			.values(transfer)
			.returning({ id: charityTransfers.id })
			.all();
		if (!row) throw new Error('failed to write a fund transfer');
		return row.id;
	}

	counterpartyNames(ids: readonly number[]): Map<number, string> {
		if (ids.length === 0) return new Map();
		return new Map(
			this.db()
				.select({ id: counterparties.id, name: counterparties.name })
				.from(counterparties)
				.where(inArray(counterparties.id, [...ids]))
				.all()
				.map((row) => [row.id, row.name])
		);
	}
}
