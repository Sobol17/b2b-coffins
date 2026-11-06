/** Published sizes and materials. Public catalog data never includes commercial fields. */
export interface PublicCatalogVariantDto {
	readonly id: number;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly lengthMm: number | null;
	readonly widthMm: number | null;
	readonly heightMm: number | null;
}

export interface PublicCatalogProductDto {
	readonly id: number;
	readonly sku: string;
	readonly title: string;
	readonly description: string | null;
	readonly categoryId: number | null;
	readonly categoryTitle: string | null;
	readonly coverMediaId: number | null;
	readonly variants: readonly PublicCatalogVariantDto[];
}

export interface PublicCatalogCategoryDto {
	readonly id: number;
	readonly title: string;
	readonly parentId: number | null;
}

export interface PublicCatalogFilters {
	readonly categoryId?: number | undefined;
}
