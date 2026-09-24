import type { CategoryRow, ProductRow } from './catalog.repository';
import type { OptionRow, VariantRow } from './variant.repository';
import type {
	CategoryDto,
	OptionDto,
	ProductDto,
	ProductListItemDto,
	VariantDto
} from '$lib/types/catalog';
import { definedProps } from '$lib/utils/props';

/** Price of a variant for the actor: personal price, and the cost price for the owner. */
export interface VariantPrice {
	readonly priceMinor: number;
	readonly costPriceMinor?: number | undefined;
}

export interface ListItemExtra {
	readonly variantCount: number;
	readonly mediaIds: readonly number[];
	readonly materialTitles: readonly string[];
	readonly lengthsMm: readonly number[];
	readonly minPriceMinor: number | undefined;
	readonly agencyPriceMinor: number | undefined;
}

/**
 * Role projection of the catalog (tech.md 8.1). A price argument is undefined for a role without
 * prices, and `definedProps` then leaves the key out of the object instead of sending null.
 */
export class CatalogDtoMapper {
	static toCategory(
		row: CategoryRow,
		productCount: number,
		minPriceMinor: number | undefined,
		agencyMinPriceMinor: number | undefined
	): CategoryDto {
		return {
			id: row.id,
			title: row.title,
			parentId: row.parentId,
			productCount,
			...definedProps({ minPriceMinor, agencyMinPriceMinor })
		};
	}

	static toListItem(row: ProductRow, extra: ListItemExtra): ProductListItemDto {
		return {
			id: row.id,
			sku: row.sku,
			title: row.title,
			categoryId: row.categoryId,
			coverMediaId: extra.mediaIds[0] ?? null,
			variantCount: extra.variantCount,
			materialTitles: extra.materialTitles,
			lengthsMm: extra.lengthsMm,
			...definedProps({
				minPriceMinor: extra.minPriceMinor,
				agencyPriceMinor: extra.agencyPriceMinor
			})
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
		price: VariantPrice | undefined
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
			...definedProps({ priceMinor: price?.priceMinor, costPriceMinor: price?.costPriceMinor })
		};
	}

	static toProduct(
		row: ProductRow & { categoryTitle: string | null },
		mediaIds: readonly number[],
		variants: readonly VariantDto[],
		agencyPriceMinor: number | undefined
	): ProductDto {
		return {
			id: row.id,
			sku: row.sku,
			title: row.title,
			description: row.description,
			categoryId: row.categoryId,
			categoryTitle: row.categoryTitle,
			mediaIds,
			variants,
			...definedProps({ agencyPriceMinor })
		};
	}
}
