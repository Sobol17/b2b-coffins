import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	dictItems,
	inventories,
	inventoryLines,
	options,
	productOptions,
	products,
	productVariants,
	requestItemOptions,
	requestItems,
	requests,
	shopJobs,
	stockItems
} from '../db/schema';
import type { StockKind } from '$lib/types/crm-stock';
import type { DictCode } from '$lib/types/dicts';

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
	readonly costPriceMinor: number;
	readonly deletedAt: Date | null;
}

export interface StockItemPatch {
	readonly code: string;
	readonly title: string;
	readonly unitId: number;
	readonly minThreshold: number;
	readonly isActive?: boolean;
	readonly costPriceMinor?: number | undefined;
}

// Table names are spelled out: inside a subquery a bare "id" would bind to the inner table.
const BALANCE = sql<number>`coalesce((select sum(m.qty) from stock_moves m where m.stock_item_id = stock_items.id), 0)`;
// One colour in the red is enough, the sum over colours could hide it (tech.md v1.45).
const IS_NEGATIVE = sql<number>`exists (select 1 from stock_moves m where m.stock_item_id = stock_items.id group by m.option_id having sum(m.qty) < 0)`;
export const BELOW_THRESHOLD = sql`(stock_items.min_threshold > 0 and ${BALANCE} < stock_items.min_threshold)`;

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
	isNegative: IS_NEGATIVE,
	costPriceMinor: stockItems.costPriceMinor,
	deletedAt: stockItems.deletedAt
};

/** Stock items of the warehouse (C8). The balance is summed from the moves in the same query. */
export class StockItemRepository extends BaseRepository<typeof stockItems> {
	constructor() {
		super(stockItems);
	}

	current(): StockItemRow[] {
		return this.select().where(isNull(stockItems.deletedAt)).all();
	}

	modelLinks(tx?: Tx, stockItemId?: number) {
		return this.db(tx)
			.select({
				stockItemId: productVariants.stockItemId,
				variantId: productVariants.id,
				modelId: products.id,
				modelTitle: products.title,
				modelCode: products.sku,
				variantLabel: productVariants.sizeCode,
				material: dictItems.title
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(
				and(
					isNull(productVariants.deletedAt),
					isNull(products.deletedAt),
					stockItemId === undefined ? undefined : eq(productVariants.stockItemId, stockItemId)
				)
			)
			.all();
	}

	archive(id: number, tx: Tx): void {
		this.db(tx)
			.update(stockItems)
			.set({ deletedAt: new Date(), isActive: false })
			.where(eq(stockItems.id, id))
			.run();
	}

	linkedOptions(stockIds: number[], tx: Tx): number[] {
		return this.db(tx)
			.select({ id: options.id })
			.from(options)
			.where(and(inArray(options.stockItemId, stockIds), eq(options.isActive, true)))
			.all()
			.map(({ id }) => id);
	}

	hasInventoryDraft(stockIds: number[], tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: inventoryLines.id })
				.from(inventoryLines)
				.innerJoin(inventories, eq(inventories.id, inventoryLines.inventoryId))
				.where(and(inArray(inventoryLines.stockItemId, stockIds), eq(inventories.status, 'draft')))
				.limit(1)
				.get() !== undefined
		);
	}

	hasOpenRequests(stockIds: number[], modelId: number | undefined, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: requestItems.id })
				.from(requestItems)
				.innerJoin(requests, eq(requests.id, requestItems.requestId))
				.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
				.where(
					and(
						this.relatedRequestLine(stockIds, modelId, tx),
						inArray(requests.status, ['draft', 'new', 'in_work', 'ready'])
					)
				)
				.limit(1)
				.get() !== undefined
		);
	}

	hasOpenProduction(stockIds: number[], modelId: number | undefined, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: shopJobs.id })
				.from(shopJobs)
				.innerJoin(requestItems, eq(requestItems.id, shopJobs.requestItemId))
				.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
				.where(and(this.relatedRequestLine(stockIds, modelId, tx), isNull(shopJobs.finishedAt)))
				.limit(1)
				.get() !== undefined
		);
	}

	private relatedRequestLine(stockIds: number[], modelId: number | undefined, tx: Tx) {
		const linesUsingOptions = this.db(tx)
			.select({ id: requestItemOptions.itemId })
			.from(requestItemOptions)
			.innerJoin(options, eq(options.id, requestItemOptions.optionId))
			.where(inArray(options.stockItemId, stockIds));
		return or(
			inArray(productVariants.stockItemId, stockIds),
			modelId === undefined ? undefined : eq(productVariants.productId, modelId),
			inArray(requestItems.id, linesUsingOptions)
		);
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
			.values({ ...item, costPriceMinor: item.costPriceMinor ?? 0 })
			.returning({ id: stockItems.id })
			.all();
		if (!row) throw new Error('failed to insert a stock item');
		return row.id;
	}

	update(id: number, patch: StockItemPatch, tx: Tx): void {
		// An absent cost is a form without the field: the stored one stays.
		const { costPriceMinor, ...rest } = patch;
		const set = costPriceMinor === undefined ? rest : { ...rest, costPriceMinor };
		this.db(tx).update(stockItems).set(set).where(eq(stockItems.id, id)).run();
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
}
