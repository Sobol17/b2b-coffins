import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { counterparties, priceListItems, priceLists, products } from '../db/schema';

export interface ManagedPriceListRow {
	readonly id: number;
	readonly title: string;
	readonly isBase: boolean;
	readonly validFrom: Date | null;
	readonly validTo: Date | null;
}

const COLUMNS = {
	id: priceLists.id,
	title: priceLists.title,
	isBase: priceLists.isBase,
	validFrom: priceLists.validFrom,
	validTo: priceLists.validTo
};

export class ManagedPriceListRepository extends BaseRepository<typeof priceLists> {
	constructor() {
		super(priceLists);
	}

	list(tx?: Tx): ManagedPriceListRow[] {
		return this.db(tx).select(COLUMNS).from(priceLists).orderBy(asc(priceLists.id)).all();
	}

	find(id: number, tx?: Tx): ManagedPriceListRow | undefined {
		return this.db(tx).select(COLUMNS).from(priceLists).where(eq(priceLists.id, id)).get();
	}

	baseExcept(id: number | undefined, tx: Tx): ManagedPriceListRow[] {
		return this.db(tx)
			.select(COLUMNS)
			.from(priceLists)
			.where(and(eq(priceLists.isBase, true), id === undefined ? undefined : ne(priceLists.id, id)))
			.all();
	}

	insert(input: Omit<ManagedPriceListRow, 'id'>, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(priceLists)
			.values(input)
			.returning({ id: priceLists.id })
			.all();
		if (!row) throw new Error('failed to insert price list');
		return row.id;
	}

	update(id: number, input: Omit<ManagedPriceListRow, 'id'>, tx: Tx): void {
		this.db(tx).update(priceLists).set(input).where(eq(priceLists.id, id)).run();
	}

	delete(id: number, tx: Tx): void {
		this.db(tx).delete(priceLists).where(eq(priceLists.id, id)).run();
	}

	assigned(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: counterparties.id })
				.from(counterparties)
				.where(or(eq(counterparties.priceListId, id), eq(counterparties.regionPriceListId, id)))
				.get() !== undefined
		);
	}

	modelChoices() {
		return this.db()
			.select({ id: products.id, sku: products.sku, productTitle: products.title })
			.from(products)
			.where(isNull(products.deletedAt))
			.orderBy(asc(products.title))
			.all();
	}

	items(id: number, tx?: Tx) {
		return this.db(tx)
			.select({ productId: priceListItems.productId, priceMinor: priceListItems.priceMinor })
			.from(priceListItems)
			.innerJoin(products, eq(products.id, priceListItems.productId))
			.where(and(eq(priceListItems.priceListId, id), isNull(products.deletedAt)))
			.orderBy(asc(priceListItems.productId))
			.all();
	}

	productAvailable(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: products.id })
				.from(products)
				.where(and(eq(products.id, id), isNull(products.deletedAt)))
				.get() !== undefined
		);
	}

	upsertItem(priceListId: number, productId: number, priceMinor: number, tx: Tx): void {
		this.db(tx)
			.insert(priceListItems)
			.values({ priceListId, productId, priceMinor })
			.onConflictDoUpdate({
				target: [priceListItems.priceListId, priceListItems.productId],
				set: { priceMinor }
			})
			.run();
	}

	deleteItem(priceListId: number, productId: number, tx: Tx): void {
		this.db(tx)
			.delete(priceListItems)
			.where(
				and(eq(priceListItems.priceListId, priceListId), eq(priceListItems.productId, productId))
			)
			.run();
	}

	/** Live variants by SKU: what an uploaded sheet may price (v1.64). */
	productIdsBySku(skus: readonly string[], tx: Tx): Map<string, number> {
		if (skus.length === 0) return new Map();
		const rows = this.db(tx)
			.select({ id: products.id, sku: products.sku })
			.from(products)
			.where(and(inArray(products.sku, [...skus]), isNull(products.deletedAt)))
			.all();
		return new Map(rows.map((row) => [row.sku, row.id]));
	}

	/** The list holds exactly these prices afterwards. */
	replaceItems(
		priceListId: number,
		rows: readonly { productId: number; priceMinor: number }[],
		tx: Tx
	): void {
		this.db(tx).delete(priceListItems).where(eq(priceListItems.priceListId, priceListId)).run();
		for (const row of rows) {
			this.db(tx)
				.insert(priceListItems)
				.values({ priceListId, ...row })
				.run();
		}
	}
}
