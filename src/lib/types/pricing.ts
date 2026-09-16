/**
 * Agency prices of a counterparty (P7). The administrator fills them on "Мои цены"; both portal
 * roles then see them in the catalog and in a request. They never take part in a request sum.
 */
export interface AgencyPriceRowDto {
	readonly productId: number;
	readonly sku: string;
	readonly title: string;
	readonly categoryTitle: string | null;
	/** Lowest personal price of the model, shown greyed out next to the input. */
	readonly minPurchasePriceMinor?: number;
	readonly agencyPriceMinor?: number;
}

export interface AgencyPriceFilters {
	readonly categoryId?: number | undefined;
}
