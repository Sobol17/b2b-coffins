import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { dictItems, options, requests, stockMoves, users } from '../db/schema';
import type { StockMoveType } from '$lib/types/dicts';
import type { ListQuery } from '$lib/types/list';
import type { StockJournalFilters } from '$lib/validation/crm-stock';

export interface StockMoveRow {
	readonly id: number;
	readonly stockItemId: number;
	readonly occurredAt: Date;
	readonly type: StockMoveType;
	readonly qty: number;
	readonly optionId: number | null;
	readonly colorTitle: string | null;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly reasonTitle: string | null;
	readonly comment: string | null;
	readonly actorName: string | null;
	readonly reversalOfId: number | null;
	readonly isReversed: number;
	readonly consumedMilli: number | null;
}

export interface NewStockMove {
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly qty: number;
	readonly type: StockMoveType;
	readonly reasonId?: number | null;
	readonly comment?: string | null;
	readonly reversalOfId?: number | null;
	readonly actorId: number;
	readonly occurredAt: Date;
}

export interface PositionRow {
	readonly optionId: number | null;
	readonly colorTitle: string | null;
	readonly balance: number;
}

const reason = alias(dictItems, 'reason');

// The table name is spelled out: inside the subquery a bare "id" would bind to the inner table.
const IS_REVERSED = sql<number>`exists (select 1 from stock_moves undo where undo.reversal_of_id = stock_moves.id)`;

const COLUMNS = {
	id: stockMoves.id,
	stockItemId: stockMoves.stockItemId,
	occurredAt: stockMoves.occurredAt,
	type: stockMoves.type,
	qty: stockMoves.qty,
	optionId: stockMoves.optionId,
	colorTitle: options.title,
	requestId: stockMoves.requestId,
	requestNumber: requests.number,
	reasonTitle: reason.title,
	comment: stockMoves.comment,
	actorName: users.fullName,
	reversalOfId: stockMoves.reversalOfId,
	isReversed: IS_REVERSED,
	consumedMilli: stockMoves.consumedMilli
};

/** The journal of the warehouse (C8): append-only, a mistake is cancelled by a reversal row. */
export class StockMoveRepository extends BaseRepository<typeof stockMoves> {
	constructor() {
		super(stockMoves);
	}

	/** Newest first, reversals included: the card shows the journal as it was written. */
	journal(
		stockItemId: number,
		query: ListQuery<StockJournalFilters>
	): { rows: StockMoveRow[]; total: number } {
		const type = query.filters?.type;
		const where = and(
			eq(stockMoves.stockItemId, stockItemId),
			type === undefined ? undefined : eq(stockMoves.type, type)
		);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(stockMoves)
			.where(where)
			.all();
		const rows = this.select()
			.where(where)
			.orderBy(desc(stockMoves.occurredAt), desc(stockMoves.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	find(id: number, tx?: Tx): StockMoveRow | undefined {
		const [row] = this.select(tx).where(eq(stockMoves.id, id)).all();
		return row;
	}

	insert(move: NewStockMove, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(stockMoves)
			.values(move)
			.returning({ id: stockMoves.id })
			.all();
		if (!row) throw new Error('failed to write a stock move');
		return row.id;
	}

	/** Balance of the item by colour; a position nothing ever moved on is absent. */
	positions(stockItemId: number, tx?: Tx): PositionRow[] {
		return this.db(tx)
			.select({
				optionId: stockMoves.optionId,
				colorTitle: options.title,
				balance: sql<number>`sum(${stockMoves.qty})`
			})
			.from(stockMoves)
			.leftJoin(options, eq(options.id, stockMoves.optionId))
			.where(eq(stockMoves.stockItemId, stockItemId))
			.groupBy(stockMoves.optionId)
			.orderBy(options.title)
			.all();
	}

	private select(tx?: Tx) {
		return this.db(tx)
			.select(COLUMNS)
			.from(stockMoves)
			.leftJoin(options, eq(options.id, stockMoves.optionId))
			.leftJoin(requests, eq(requests.id, stockMoves.requestId))
			.leftJoin(reason, eq(reason.id, stockMoves.reasonId))
			.leftJoin(users, eq(users.id, stockMoves.actorId))
			.$dynamic();
	}
}
