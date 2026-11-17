import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import { categories, counterparties, priceListItems, priceLists, products } from '../db/schema';
import type { CounterpartyPriceFilters } from '$lib/types/crm-counterparty';
import type { ListQuery } from '$lib/types/list';

export interface PriceVariantRow {
	readonly productId: number;
	readonly productTitle: string;
	readonly categoryTitle: string | null;
	readonly sku: string;
	readonly basePriceMinor: number;
}

const VARIANT_COLUMNS = {
	productId: products.id,
	productTitle: products.title,
	categoryTitle: categories.title,
	sku: products.sku,
	basePriceMinor: products.basePriceMinor
};

/**
 * Variants of the catalog and the personal price list of one counterparty, for the «Цены» tab of
 * its workshop card. Which list applies is still decided by PersonalPriceResolver.
 */
export class CounterpartyPriceRepository extends BaseRepository<typeof priceListItems> {
	constructor() {
		super(priceListItems);
	}

	/** Live variants in catalog order: section, then model, then size. */
	variants(query: ListQuery<CounterpartyPriceFilters>): { rows: PriceVariantRow[]; total: number } {
		const where = this.variantWhere(query.filters);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(products)
			.where(where)
			.all();
		const rows = this.db()
			.select(VARIANT_COLUMNS)
			.from(products)
			.leftJoin(categories, eq(categories.id, products.categoryId))
			.where(where)
			.orderBy(
				asc(categories.sortOrder),
				asc(products.sortOrder),
				asc(products.title),
				asc(products.sku)
			)
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	/** Sections that hold a live variant, for the filter of the tab. */
	categories(): { id: number; title: string }[] {
		return this.db()
			.selectDistinct({
				id: categories.id,
				title: categories.title,
				sortOrder: categories.sortOrder
			})
			.from(categories)
			.innerJoin(products, eq(products.categoryId, categories.id))
			.where(isNull(products.deletedAt))
			.orderBy(asc(categories.sortOrder), asc(categories.title))
			.all()
			.map(({ id, title }) => ({ id, title }));
	}

	/** The subset of `ids` that are live variants: a crafted form must not price a removed one. */
	liveProductIds(ids: readonly number[], tx?: Tx): Set<number> {
		if (ids.length === 0) return new Set();
		const rows = this.db(tx)
			.select({ id: products.id })
			.from(products)
			.where(and(inArray(products.id, [...ids]), isNull(products.deletedAt)))
			.all();
		return new Set(rows.map((row) => row.id));
	}

	/** Assignments in either tier, removed counterparties included: their prices must not move. */
	holders(priceListId: number, tx?: Tx): number {
		const [row] = this.db(tx)
			.select({ total: countExpression })
			.from(counterparties)
			.where(eq(counterparties.priceListId, priceListId))
			.all();
		const [regional] = this.db(tx)
			.select({ total: countExpression })
			.from(counterparties)
			.where(eq(counterparties.regionPriceListId, priceListId))
			.all();
		// A regional reference blocks reuse even when the same counterparty holds both tiers.
		return (row?.total ?? 0) + (regional?.total ?? 0);
	}

	/** Entries of a list, or of the given variants only. */
	items(priceListId: number, productIds?: readonly number[], tx?: Tx): Map<number, number> {
		if (productIds !== undefined && productIds.length === 0) return new Map();
		const scope = eq(priceListItems.priceListId, priceListId);
		const rows = this.db(tx)
			.select({ productId: priceListItems.productId, priceMinor: priceListItems.priceMinor })
			.from(priceListItems)
			.where(
				productIds === undefined
					? scope
					: and(scope, inArray(priceListItems.productId, [...productIds]))
			)
			.all();
		return new Map(rows.map((row) => [row.productId, row.priceMinor]));
	}

	/** A new personal list with the entries of `copyFromId`, assigned to the counterparty. */
	fork(counterpartyId: number, title: string, copyFromId: number | null, tx: Tx): number {
		const [list] = this.db(tx)
			.insert(priceLists)
			.values({ title, isBase: false, isPersonal: true })
			.returning({ id: priceLists.id })
			.all();
		if (!list) throw new Error('failed to insert price list');
		const copied =
			copyFromId === null ? new Map<number, number>() : this.items(copyFromId, undefined, tx);
		for (const [productId, priceMinor] of copied) {
			this.db(tx)
				.insert(priceListItems)
				.values({ priceListId: list.id, productId, priceMinor })
				.run();
		}
		this.db(tx)
			.update(counterparties)
			.set({ priceListId: list.id, updatedAt: new Date() })
			.where(eq(counterparties.id, counterpartyId))
			.run();
		return list.id;
	}

	/** Every entry of `listId` becomes a copy of `fromId`: the refill from the region (v1.64). */
	replace(listId: number, fromId: number, tx: Tx): number {
		this.db(tx).delete(priceListItems).where(eq(priceListItems.priceListId, listId)).run();
		const copied = this.items(fromId, undefined, tx);
		for (const [productId, priceMinor] of copied) {
			this.db(tx)
				.insert(priceListItems)
				.values({ priceListId: listId, productId, priceMinor })
				.run();
		}
		return copied.size;
	}

	upsert(
		priceListId: number,
		rows: readonly { productId: number; priceMinor: number }[],
		tx: Tx
	): void {
		for (const row of rows) {
			this.db(tx)
				.insert(priceListItems)
				.values({ priceListId, productId: row.productId, priceMinor: row.priceMinor })
				.onConflictDoUpdate({
					target: [priceListItems.priceListId, priceListItems.productId],
					set: { priceMinor: row.priceMinor }
				})
				.run();
		}
	}

	clear(priceListId: number, productIds: readonly number[], tx: Tx): void {
		if (productIds.length === 0) return;
		this.db(tx)
			.delete(priceListItems)
			.where(
				and(
					eq(priceListItems.priceListId, priceListId),
					inArray(priceListItems.productId, [...productIds])
				)
			)
			.run();
	}

	private variantWhere(filters: CounterpartyPriceFilters | undefined): SQL | undefined {
		const search = filters?.search;
		return and(
			isNull(products.deletedAt),
			filters?.categoryId === undefined ? undefined : eq(products.categoryId, filters.categoryId),
			search === undefined
				? undefined
				: or(containsText(products.title, search), containsText(products.sku, search))
		);
	}
}
