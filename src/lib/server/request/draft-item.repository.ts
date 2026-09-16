import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { productVisible, variantVisible } from '../catalog/visibility';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	dictItems,
	options,
	productVariants,
	products,
	requestItemOptions,
	requestItems
} from '../db/schema';
import type { OptionKind } from '$lib/types/catalog';

export interface DraftLineRow {
	readonly id: number;
	readonly variantId: number;
	readonly qty: number;
	readonly productId: number;
	readonly productTitle: string;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly engraving: string | null;
	readonly comment: string | null;
}

export interface LineOptionRow {
	readonly itemId: number;
	readonly optionId: number;
	readonly kind: OptionKind;
	readonly title: string;
}

export interface LinePriceRow {
	readonly unitPriceMinor: number;
	readonly optionsMinor: number;
	readonly lineTotalMinor: number;
}

export interface OptionDelta {
	readonly optionId: number;
	readonly priceDeltaMinor: number;
}

// Portal users order only what the storefront shows them.
const STOREFRONT = { publishedOnly: true } as const;

const LINE_COLUMNS = {
	id: requestItems.id,
	variantId: requestItems.variantId,
	qty: requestItems.qty,
	productId: products.id,
	productTitle: products.title,
	sku: productVariants.sku,
	sizeCode: productVariants.sizeCode,
	materialTitle: dictItems.title,
	engraving: requestItems.engraving,
	comment: requestItems.comment
};

/** Lines of a request and their options. Money columns are read by `linePrices` only. */
export class DraftItemRepository extends BaseRepository<typeof requestItems> {
	constructor() {
		super(requestItems);
	}

	lines(requestId: number, tx?: Tx): DraftLineRow[] {
		return this.joined(tx)
			.where(eq(requestItems.requestId, requestId))
			.orderBy(asc(requestItems.id))
			.all();
	}

	findLine(requestId: number, itemId: number, tx?: Tx): DraftLineRow | undefined {
		const [row] = this.joined(tx)
			.where(and(eq(requestItems.requestId, requestId), eq(requestItems.id, itemId)))
			.all();
		return row;
	}

	lineOptions(itemIds: readonly number[], tx?: Tx): LineOptionRow[] {
		if (itemIds.length === 0) return [];
		return this.db(tx)
			.select({
				itemId: requestItemOptions.itemId,
				optionId: options.id,
				kind: options.kind,
				title: options.title
			})
			.from(requestItemOptions)
			.innerJoin(options, eq(options.id, requestItemOptions.optionId))
			.where(inArray(requestItemOptions.itemId, [...itemIds]))
			.orderBy(asc(options.kind))
			.all();
	}

	linePrices(itemIds: readonly number[]): Map<number, LinePriceRow> {
		if (itemIds.length === 0) return new Map();
		const rows = this.db()
			.select({
				id: requestItems.id,
				unitPriceMinor: requestItems.unitPriceMinor,
				lineTotalMinor: requestItems.lineTotalMinor,
				optionsMinor: sql<number>`coalesce(sum(${requestItemOptions.priceDeltaMinor}), 0)`
			})
			.from(requestItems)
			.leftJoin(requestItemOptions, eq(requestItemOptions.itemId, requestItems.id))
			.where(inArray(requestItems.id, [...itemIds]))
			.groupBy(requestItems.id)
			.all();
		return new Map(rows.map(({ id, ...price }) => [id, price]));
	}

	/** A variant the storefront offers: published and not deleted, together with its model. */
	findOrderableVariant(variantId: number, tx?: Tx): { id: number; productId: number } | undefined {
		const [row] = this.db(tx)
			.select({ id: productVariants.id, productId: productVariants.productId })
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(
				and(
					eq(productVariants.id, variantId),
					productVisible(STOREFRONT),
					variantVisible(STOREFRONT)
				)
			)
			.all();
		return row;
	}

	insertLine(
		line: { requestId: number; variantId: number; qty: number },
		optionIds: readonly number[],
		tx: Tx
	): number {
		const [created] = this.db(tx)
			.insert(requestItems)
			.values(line)
			.returning({ id: requestItems.id })
			.all();
		if (!created) throw new Error('failed to insert a request line');
		if (optionIds.length > 0) {
			this.db(tx)
				.insert(requestItemOptions)
				.values(optionIds.map((optionId) => ({ itemId: created.id, optionId })))
				.run();
		}
		return created.id;
	}

	setQty(itemId: number, qty: number, tx: Tx): void {
		this.db(tx).update(requestItems).set({ qty }).where(eq(requestItems.id, itemId)).run();
	}

	deleteLine(itemId: number, tx: Tx): void {
		this.db(tx).delete(requestItems).where(eq(requestItems.id, itemId)).run();
	}

	clear(requestId: number, tx: Tx): void {
		this.db(tx).delete(requestItems).where(eq(requestItems.requestId, requestId)).run();
	}

	savePrices(
		itemId: number,
		prices: { unitPriceMinor: number; lineTotalMinor: number },
		deltas: readonly OptionDelta[],
		tx: Tx
	): void {
		this.db(tx).update(requestItems).set(prices).where(eq(requestItems.id, itemId)).run();
		for (const delta of deltas) {
			this.db(tx)
				.update(requestItemOptions)
				.set({ priceDeltaMinor: delta.priceDeltaMinor })
				.where(
					and(
						eq(requestItemOptions.itemId, itemId),
						eq(requestItemOptions.optionId, delta.optionId)
					)
				)
				.run();
		}
	}

	private joined(tx?: Tx) {
		return this.db(tx)
			.select(LINE_COLUMNS)
			.from(requestItems)
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.$dynamic();
	}
}
