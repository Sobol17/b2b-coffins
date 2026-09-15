import type { ProductRow } from './catalog.repository';
import type { OptionRow, PriceRow, VariantRow } from './variant.repository';
import type { OptionDto, ProductDto, ProductListItemDto, VariantDto } from '$lib/types/catalog';
import { definedProps } from '$lib/utils/props';

/**
 * Role projection of the catalog (tech.md 8.1). A price argument is undefined for a role without
 * prices, and `definedProps` then leaves the key out of the object instead of sending null.
 */
export class CatalogDtoMapper {
	static toListItem(
		row: ProductRow,
		extra: {
			variantCount: number;
			mediaIds: readonly number[];
			minPriceMinor: number | undefined;
		}
	): ProductListItemDto {
		return {
			id: row.id,
			sku: row.sku,
			title: row.title,
			categoryId: row.categoryId,
			coverMediaId: extra.mediaIds[0] ?? null,
			variantCount: extra.variantCount,
			...definedProps({ minPriceMinor: extra.minPriceMinor })
		};
	}

	static toOption(row: OptionRow, priceDeltaMinor: number | undefined): OptionDto {
		return {
			id: row.id,
			kind: row.kind,
			title: row.title,
			isDefault: row.isDefault,
			...definedProps({ priceDeltaMinor })
		};
	}

	static toVariant(
		row: VariantRow,
		options: readonly OptionDto[],
		price: PriceRow | undefined
	): VariantDto {
		return {
			id: row.id,
			sku: row.sku,
			sizeCode: row.sizeCode,
			materialTitle: row.materialTitle,
			lengthMm: row.lengthMm,
			widthMm: row.widthMm,
			heightMm: row.heightMm,
			weightG: row.weightG,
			options,
			...definedProps({ priceMinor: price?.basePriceMinor, costPriceMinor: price?.costPriceMinor })
		};
	}

	static toProduct(
		row: ProductRow & { categoryTitle: string | null },
		mediaIds: readonly number[],
		variants: readonly VariantDto[]
	): ProductDto {
		return {
			id: row.id,
			sku: row.sku,
			title: row.title,
			description: row.description,
			categoryId: row.categoryId,
			categoryTitle: row.categoryTitle,
			mediaIds,
			variants
		};
	}
}
