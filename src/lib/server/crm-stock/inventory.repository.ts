import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	dictItems,
	inventories,
	inventoryLines,
	options,
	stockItems,
	stockMoves,
	users
} from '../db/schema';
import type { InventoryStatus, StockKind } from '$lib/types/crm-stock';
import type { ListQuery } from '$lib/types/list';

export interface InventoryRow {
	readonly id: number;
	readonly kind: StockKind;
	readonly status: InventoryStatus;
	readonly comment: string | null;
	readonly createdByName: string;
	readonly createdAt: Date;
	readonly appliedAt: Date | null;
	readonly lineCount: number;
	readonly diffCount: number;
}

export interface InventoryLineRow {
	readonly id: number;
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly code: string;
	readonly title: string;
	readonly colorTitle: string | null;
	readonly unitTitle: string;
	readonly expectedQty: number;
	readonly actualQty: number;
}

export interface CountablePosition {
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly balance: number;
}

// The table name is spelled out: inside the subquery a bare "id" would bind to the inner table.
const LINE_COUNT = sql<number>`(select count(*) from inventory_lines l where l.inventory_id = inventories.id)`;
const DIFF_COUNT = sql<number>`(select count(*) from inventory_lines l where l.inventory_id = inventories.id and l.actual_qty <> l.expected_qty)`;

const COLUMNS = {
	id: inventories.id,
	kind: inventories.kind,
	status: inventories.status,
	comment: inventories.comment,
	createdByName: users.fullName,
	createdAt: inventories.createdAt,
	appliedAt: inventories.appliedAt,
	lineCount: LINE_COUNT,
	diffCount: DIFF_COUNT
};

/** Inventories of the warehouse (C8, tech.md v1.45): a draft of counted lines, applied once. */
export class InventoryRepository extends BaseRepository<typeof inventories> {
	constructor() {
		super(inventories);
	}

	list(query: ListQuery<unknown>): { rows: InventoryRow[]; total: number } {
		const [counted] = this.db().select({ total: countExpression }).from(inventories).all();
		const rows = this.select()
			.orderBy(desc(inventories.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	find(id: number, tx?: Tx): InventoryRow | undefined {
		const [row] = this.select(tx).where(eq(inventories.id, id)).all();
		return row;
	}

	openDraftId(kind: StockKind, tx: Tx): number | undefined {
		const [row] = this.db(tx)
			.select({ id: inventories.id })
			.from(inventories)
			.where(and(eq(inventories.kind, kind), eq(inventories.status, 'draft')))
			.all();
		return row?.id;
	}

	lines(inventoryId: number, tx?: Tx): InventoryLineRow[] {
		return this.db(tx)
			.select({
				id: inventoryLines.id,
				stockItemId: inventoryLines.stockItemId,
				optionId: inventoryLines.optionId,
				code: stockItems.code,
				title: stockItems.title,
				colorTitle: options.title,
				unitTitle: dictItems.title,
				expectedQty: inventoryLines.expectedQty,
				actualQty: inventoryLines.actualQty
			})
			.from(inventoryLines)
			.innerJoin(stockItems, eq(stockItems.id, inventoryLines.stockItemId))
			.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
			.leftJoin(options, eq(options.id, inventoryLines.optionId))
			.where(eq(inventoryLines.inventoryId, inventoryId))
			.orderBy(asc(stockItems.title), asc(options.title), asc(inventoryLines.id))
			.all();
	}

	/**
	 * What a new draft counts: every active component, and every colour of an active product that
	 * a move has ever touched. A product nothing moved on has no position to count yet.
	 */
	countable(kind: StockKind, tx: Tx): CountablePosition[] {
		const balance = sql<number>`coalesce(sum(${stockMoves.qty}), 0)`;
		const base = this.db(tx)
			.select({ stockItemId: stockItems.id, optionId: stockMoves.optionId, balance })
			.from(stockItems);
		const joined =
			kind === 'component'
				? base.leftJoin(stockMoves, eq(stockMoves.stockItemId, stockItems.id))
				: base.innerJoin(stockMoves, eq(stockMoves.stockItemId, stockItems.id));
		return joined
			.where(and(eq(stockItems.kind, kind), eq(stockItems.isActive, true)))
			.groupBy(stockItems.id, stockMoves.optionId)
			.orderBy(asc(stockItems.id))
			.all();
	}

	insert(
		draft: { kind: StockKind; comment: string | null; createdById: number },
		positions: readonly CountablePosition[],
		tx: Tx
	): number {
		const [row] = this.db(tx)
			.insert(inventories)
			.values({ ...draft, status: 'draft' })
			.returning({ id: inventories.id })
			.all();
		if (!row) throw new Error('failed to insert an inventory');
		this.db(tx)
			.insert(inventoryLines)
			.values(
				positions.map((position) => ({
					inventoryId: row.id,
					stockItemId: position.stockItemId,
					optionId: position.optionId,
					expectedQty: position.balance,
					actualQty: position.balance
				}))
			)
			.run();
		return row.id;
	}

	setComment(id: number, comment: string | null, tx: Tx): void {
		this.db(tx).update(inventories).set({ comment }).where(eq(inventories.id, id)).run();
	}

	setLine(lineId: number, patch: { expectedQty: number; actualQty?: number }, tx: Tx): void {
		this.db(tx).update(inventoryLines).set(patch).where(eq(inventoryLines.id, lineId)).run();
	}

	markApplied(id: number, appliedAt: Date, tx: Tx): void {
		this.db(tx)
			.update(inventories)
			.set({ status: 'applied', appliedAt })
			.where(eq(inventories.id, id))
			.run();
	}

	/** Lines go with the draft through the cascade of the schema. */
	delete(id: number, tx: Tx): void {
		this.db(tx).delete(inventories).where(eq(inventories.id, id)).run();
	}

	private select(tx?: Tx) {
		return this.db(tx)
			.select(COLUMNS)
			.from(inventories)
			.innerJoin(users, eq(users.id, inventories.createdById))
			.$dynamic();
	}
}
