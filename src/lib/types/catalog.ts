export const OPTION_KINDS = ['finish', 'lacquer', 'upholstery', 'hardware', 'kit'] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

export interface CatalogFilters {
	readonly categoryId?: number | undefined;
}

export interface CategoryDto {
	readonly id: number;
	readonly title: string;
	readonly parentId: number | null;
	/** Products the actor may see in this category. */
	readonly productCount: number;
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
	readonly minPriceMinor?: number;
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
}
