import { and, asc, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { countExpression, offsetFor, orderByFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import { dictItems, options, productOptions, productVariants, stockItems } from '../db/schema';
import type { StockFilters, StockKind } from '$lib/types/crm-stock';
import type { DictCode } from '$lib/types/dicts';
import type { ListQuery } from '$lib/types/list';

export interface StockItemRow {
	readonly id: number;
	readonly kind: StockKind;
	readonly code: string;
	readonly title: string;
	readonly unitId: number;
	readonly unitTitle: string;
	readonly minThreshold: number;
	readonly isActive: boolean;
	readonly balance: number;
	readonly isNegative: number;
}

export interface StockItemPatch {
	readonly code: string;
	readonly title: string;
	readonly unitId: number;
	readonly minThreshold: number;
	readonly isActive?: boolean;
}

// Table names are spelled out: inside a subquery a bare "id" would bind to the inner table.
const BALANCE = sql<number>`coalesce((select sum(m.qty) from stock_moves m where m.stock_item_id = stock_items.id), 0)`;
// One colour in the red is enough, the sum over colours could hide it (tech.md v1.45).
const IS_NEGATIVE = sql<number>`exists (select 1 from stock_moves m where m.stock_item_id = stock_items.id group by m.option_id having sum(m.qty) < 0)`;
const BELOW_THRESHOLD = sql`(stock_items.min_threshold > 0 and ${BALANCE} < stock_items.min_threshold)`;

const COLUMNS = {
	id: stockItems.id,
	kind: stockItems.kind,
	code: stockItems.code,
	title: stockItems.title,
	unitId: stockItems.unitId,
	unitTitle: dictItems.title,
	minThreshold: stockItems.minThreshold,
	isActive: stockItems.isActive,
	balance: BALANCE,
	isNegative: IS_NEGATIVE
};

const SORTABLE = { code: stockItems.code, title: stockItems.title };

/** Stock items of the warehouse (C8). The balance is summed from the moves in the same query. */
export class StockItemRepository extends BaseRepository<typeof stockItems> {
	constructor() {
		super(stockItems);
	}

	list(query: ListQuery<StockFilters>): { rows: StockItemRow[]; total: number } {
		const where = this.where(query);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(stockItems)
			.where(where)
			.all();
		const rows = this.select()
			.where(where)
			.orderBy(
				orderByFor({ ...query, dir: query.dir ?? 'asc' }, SORTABLE, stockItems.title),
				asc(stockItems.id)
			)
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	find(id: number, tx?: Tx): StockItemRow | undefined {
		const [row] = this.select(tx).where(eq(stockItems.id, id)).all();
		return row;
	}

	codeTaken(code: string, exceptId: number | null, tx?: Tx): boolean {
		const [row] = this.db(tx)
			.select({ id: stockItems.id })
			.from(stockItems)
			.where(
				and(eq(stockItems.code, code), exceptId === null ? undefined : ne(stockItems.id, exceptId))
			)
			.all();
		return row !== undefined;
	}

	insert(item: StockItemPatch & { kind: StockKind }, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(stockItems)
			.values(item)
			.returning({ id: stockItems.id })
			.all();
		if (!row) throw new Error('failed to insert a stock item');
		return row.id;
	}

	update(id: number, patch: StockItemPatch, tx: Tx): void {
		this.db(tx).update(stockItems).set(patch).where(eq(stockItems.id, id)).run();
	}

	/** Colours the variants of the item are made in: the compatibility matrix of C2. */
	colours(id: number, tx?: Tx): { id: number; title: string }[] {
		return this.db(tx)
			.selectDistinct({ id: options.id, title: options.title })
			.from(productVariants)
			.innerJoin(productOptions, eq(productOptions.variantId, productVariants.id))
			.innerJoin(options, eq(options.id, productOptions.optionId))
			.where(
				and(
					eq(productVariants.stockItemId, id),
					isNull(productVariants.deletedAt),
					eq(options.kind, 'color')
				)
			)
			.orderBy(asc(options.title), asc(options.id))
			.all();
	}

	/** Active items of a dictionary, for the unit and the reason selects. */
	dict(dict: DictCode, tx?: Tx): { id: number; title: string }[] {
		return this.db(tx)
			.select({ id: dictItems.id, title: dictItems.title })
			.from(dictItems)
			.where(and(eq(dictItems.dict, dict), eq(dictItems.isActive, true)))
			.orderBy(asc(dictItems.sortOrder), asc(dictItems.title))
			.all();
	}

	private select(tx?: Tx) {
		return this.db(tx)
			.select(COLUMNS)
			.from(stockItems)
			.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
			.$dynamic();
	}

	private where(query: ListQuery<StockFilters>): SQL | undefined {
		const filters = query.filters ?? {};
		return and(
			filters.kind === undefined ? undefined : eq(stockItems.kind, filters.kind),
			filters.activeOnly ? eq(stockItems.isActive, true) : undefined,
			filters.belowThreshold ? BELOW_THRESHOLD : undefined,
			filters.negative ? IS_NEGATIVE : undefined,
			query.search === undefined
				? undefined
				: or(
						containsText(stockItems.title, query.search),
						containsText(stockItems.code, query.search)
					)
		);
	}
}
