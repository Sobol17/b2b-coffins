import type { ProductRow } from '../catalog/catalog.repository';
import type { VariantRow } from '../catalog/variant.repository';
import type { PublicCatalogProductDto } from '$lib/types/public-catalog';

/** Explicit public projection, independent of the signed-in catalog's optional prices. */
export class PublicCatalogDtoMapper {
	static product(
		row: ProductRow,
		categoryTitle: string | null,
		coverMediaId: number | null,
		variants: readonly VariantRow[]
	): PublicCatalogProductDto {
		return {
			id: row.id,
			sku: row.sku,
			title: row.title,
			description: row.description,
			categoryId: row.categoryId,
			categoryTitle,
			coverMediaId,
			variants: variants.map((variant) => ({
				id: variant.id,
				sizeCode: variant.sizeCode,
				materialTitle: variant.materialTitle,
				lengthMm: variant.lengthMm,
				widthMm: variant.widthMm,
				heightMm: variant.heightMm
			}))
		};
	}
}
