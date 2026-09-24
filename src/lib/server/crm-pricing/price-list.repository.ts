import { and, asc, eq, ne } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { counterparties, priceListItems, priceLists, productVariants } from '../db/schema';

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
				.where(eq(counterparties.priceListId, id))
				.get() !== undefined
		);
	}

	items(id: number, tx?: Tx) {
		return this.db(tx)
			.select({ variantId: priceListItems.variantId, priceMinor: priceListItems.priceMinor })
			.from(priceListItems)
			.where(eq(priceListItems.priceListId, id))
			.orderBy(asc(priceListItems.variantId))
			.all();
	}

	variantAvailable(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: productVariants.id })
				.from(productVariants)
				.where(eq(productVariants.id, id))
				.get() !== undefined
		);
	}

	upsertItem(priceListId: number, variantId: number, priceMinor: number, tx: Tx): void {
		this.db(tx)
			.insert(priceListItems)
			.values({ priceListId, variantId, priceMinor })
			.onConflictDoUpdate({
				target: [priceListItems.priceListId, priceListItems.variantId],
				set: { priceMinor }
			})
			.run();
	}

	deleteItem(priceListId: number, variantId: number, tx: Tx): void {
		this.db(tx)
			.delete(priceListItems)
			.where(
				and(eq(priceListItems.priceListId, priceListId), eq(priceListItems.variantId, variantId))
			)
			.run();
	}
}
