import { and, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { counterparties, priceListItems, priceLists } from '../db/schema';

export interface PriceListRow {
	readonly id: number;
	readonly isBase: boolean;
	readonly validFrom: Date | null;
	readonly validTo: Date | null;
}

const LIST_COLUMNS = {
	id: priceLists.id,
	isBase: priceLists.isBase,
	validFrom: priceLists.validFrom,
	validTo: priceLists.validTo
};

/** Price lists and their entries. Which list applies is decided by PersonalPriceResolver. */
export class PriceRepository extends BaseRepository<typeof priceListItems> {
	constructor() {
		super(priceListItems);
	}

	baseLists(): PriceListRow[] {
		return this.db().select(LIST_COLUMNS).from(priceLists).where(eq(priceLists.isBase, true)).all();
	}

	counterpartyList(counterpartyId: number): PriceListRow | undefined {
		const [row] = this.db()
			.select(LIST_COLUMNS)
			.from(counterparties)
			.innerJoin(priceLists, eq(priceLists.id, counterparties.priceListId))
			.where(eq(counterparties.id, counterpartyId))
			.all();
		return row;
	}

	itemsFor(priceListId: number, variantIds: readonly number[]): Map<number, number> {
		if (variantIds.length === 0) return new Map();
		const rows = this.db()
			.select({ variantId: priceListItems.variantId, priceMinor: priceListItems.priceMinor })
			.from(priceListItems)
			.where(
				and(
					eq(priceListItems.priceListId, priceListId),
					inArray(priceListItems.variantId, [...variantIds])
				)
			)
			.all();
		return new Map(rows.map((row) => [row.variantId, row.priceMinor]));
	}
}
