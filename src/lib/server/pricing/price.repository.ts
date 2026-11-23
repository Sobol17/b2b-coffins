import { and, eq, inArray } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { counterparties, priceListItems, priceLists, productVariants } from '../db/schema';

export interface PriceListRow {
	readonly id: number;
	readonly isBase: boolean;
	readonly isPersonal: boolean;
	readonly validFrom: Date | null;
	readonly validTo: Date | null;
}

const LIST_COLUMNS = {
	id: priceLists.id,
	isBase: priceLists.isBase,
	isPersonal: priceLists.isPersonal,
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

	/** The regional list of a counterparty (v1.64): the tier under its personal list. */
	regionList(counterpartyId: number): PriceListRow | undefined {
		const [row] = this.db()
			.select(LIST_COLUMNS)
			.from(counterparties)
			.innerJoin(priceLists, eq(priceLists.id, counterparties.regionPriceListId))
			.where(eq(counterparties.id, counterpartyId))
			.all();
		return row;
	}

	/** The contract rate of a counterparty the caller has already reached by its own rule. */
	contractDiscount(counterpartyId: number): number {
		const [row] = this.db()
			.select({ percent: counterparties.discountPercent })
			.from(counterparties)
			.where(eq(counterparties.id, counterpartyId))
			.all();
		return row?.percent ?? 0;
	}

	itemsFor(priceListId: number, variantIds: readonly number[]): Map<number, number> {
		if (variantIds.length === 0) return new Map();
		const rows = this.db()
			.select({ variantId: productVariants.id, priceMinor: priceListItems.priceMinor })
			.from(priceListItems)
			.innerJoin(productVariants, eq(productVariants.productId, priceListItems.productId))
			.where(
				and(
					eq(priceListItems.priceListId, priceListId),
					inArray(productVariants.id, [...variantIds])
				)
			)
			.all();
		return new Map(rows.map((row) => [row.variantId, row.priceMinor]));
	}
}
