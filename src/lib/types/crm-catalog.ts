/** Workshop catalog management projections from tech.md §8 (C2). */
export interface CrmCategoryDto {
	readonly id: number;
	readonly title: string;
	readonly parentId: number | null;
	readonly sortOrder: number;
}

export interface CrmMediaDto {
	readonly id: number;
	readonly sortOrder: number;
	readonly isCover: boolean;
}

export interface CrmOptionDto {
	readonly id: number;
	readonly kind: 'color';
	readonly title: string;
	readonly priceDeltaMinor: number;
	readonly stockItemId: number | null;
	readonly isActive: boolean;
}

export interface CrmVariantDto {
	readonly id: number;
	readonly productId: number;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialId: number;
	readonly lengthMm: number | null;
	readonly widthMm: number | null;
	readonly heightMm: number | null;
	readonly weightG: number | null;
	readonly basePriceMinor: number;
	readonly costPriceMinor?: number;
	readonly stockItemId: number | null;
	readonly isPublished: boolean;
	readonly isDeleted: boolean;
	readonly options: readonly { readonly optionId: number; readonly isDefault: boolean }[];
	readonly activeBomNorms: readonly {
		readonly id: number;
		readonly componentId: number;
		readonly qtyPerUnitMilli: number;
	}[];
}

export interface CrmProductDto {
	readonly id: number;
	readonly sku: string;
	readonly title: string;
	readonly categoryId: number | null;
	readonly description: string | null;
	readonly isPublished: boolean;
	readonly isDeleted: boolean;
	readonly sortOrder: number;
	readonly media: readonly CrmMediaDto[];
	readonly variants: readonly CrmVariantDto[];
}

export interface CrmProductListItemDto {
	readonly id: number;
	readonly sku: string;
	readonly title: string;
	readonly categoryId: number | null;
	readonly isPublished: boolean;
	readonly isDeleted: boolean;
	readonly variantCount: number;
	readonly coverMediaId: number | null;
}

export interface CrmPriceListDto {
	readonly id: number;
	readonly title: string;
	readonly isBase: boolean;
	readonly validFrom: string | null;
	readonly validTo: string | null;
	readonly items: readonly { readonly variantId: number; readonly priceMinor: number }[];
}

export interface CrmDiscountRuleDto {
	readonly id: number;
	readonly counterpartyId: number | null;
	readonly categoryId: number | null;
	readonly percent: number;
	readonly validFrom: string | null;
	readonly validTo: string | null;
}

export interface CrmCatalogChoicesDto {
	readonly materials: readonly { readonly id: number; readonly title: string }[];
	readonly stockProducts: readonly {
		readonly id: number;
		readonly code: string;
		readonly title: string;
	}[];
	readonly stockComponents: readonly {
		readonly id: number;
		readonly code: string;
		readonly title: string;
	}[];
	readonly variants: readonly {
		readonly id: number;
		readonly sku: string;
		readonly productTitle: string;
	}[];
}

export interface CrmPricingChoicesDto {
	readonly counterparties: readonly { readonly id: number; readonly name: string }[];
}
