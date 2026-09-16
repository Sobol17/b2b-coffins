export const OPTION_KINDS = ['finish', 'lacquer', 'upholstery', 'hardware', 'kit'] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

export const CATALOG_SORTS = ['sortOrder', 'title', 'price'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Storefront filters (P3). One variant of a model has to satisfy all of them at once. */
export interface CatalogFilters {
	readonly categoryId?: number | undefined;
	readonly materialIds?: readonly number[] | undefined;
	readonly finishOptionIds?: readonly number[] | undefined;
	readonly lengthFromMm?: number | undefined;
	readonly lengthToMm?: number | undefined;
	readonly inStock?: boolean | undefined;
}

export interface CatalogFacetsDto {
	readonly materials: readonly { id: number; title: string; productCount: number }[];
	readonly finishes: readonly { id: number; title: string }[];
	readonly lengthMm: { readonly min: number | null; readonly max: number | null };
}

/** A top-level group of the catalog page: its subcategories, or its models when it has none. */
export interface CategoryGroupDto {
	readonly category: CategoryDto;
	readonly children: readonly CategoryDto[];
	readonly showcase: readonly ProductListItemDto[];
}

export interface CategoryDto {
	readonly id: number;
	readonly title: string;
	readonly parentId: number | null;
	/** Products the actor may see in this category and its subcategories. */
	readonly productCount: number;
	/** Lowest personal price inside the category tree, for a role with prices. */
	readonly minPriceMinor?: number;
	/** Lowest agency price inside the tree: what a portal role without prices sees as "from". */
	readonly minAgencyPriceMinor?: number;
}

/*
 * Role-projected catalog DTOs (tech.md 8.1). Price fields are optional by type: a role without
 * prices never receives them, and the server never even selects the columns for it.
 */
export interface ProductListItemDto {
	readonly id: number;
	readonly sku: string;
	readonly title: string;
	readonly categoryId: number | null;
	readonly coverMediaId: number | null;
	readonly variantCount: number;
	readonly materialTitles: readonly string[];
	readonly lengthsMm: readonly number[];
	/** Sum of the stock balances of the visible variants, never below zero. */
	readonly stockQty: number;
	readonly minPriceMinor?: number;
	/** Price the counterparty shows its own client (P7). One per model, both portal roles see it. */
	readonly agencyPriceMinor?: number;
}

export interface OptionDto {
	readonly id: number;
	readonly kind: OptionKind;
	readonly title: string;
	readonly isDefault: boolean;
	readonly priceDeltaMinor?: number;
}

export interface VariantDto {
	readonly id: number;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly lengthMm: number | null;
	readonly widthMm: number | null;
	readonly heightMm: number | null;
	readonly weightG: number | null;
	/** Compatibility matrix: the options allowed for this variant. */
	readonly options: readonly OptionDto[];
	/** Stock balance: the sum of moves (tech.md 5.7), shown as zero when it runs negative. */
	readonly stockQty: number;
	/** Base price in P1; P2 replaces the source with the personal price of the counterparty. */
	readonly priceMinor?: number;
	/** Owner only. */
	readonly costPriceMinor?: number;
}

export interface ProductDto {
	readonly id: number;
	readonly sku: string;
	readonly title: string;
	readonly description: string | null;
	readonly categoryId: number | null;
	readonly categoryTitle: string | null;
	readonly mediaIds: readonly number[];
	readonly variants: readonly VariantDto[];
	/** One per model: neither the size nor the options move it (P7). */
	readonly agencyPriceMinor?: number;
}
