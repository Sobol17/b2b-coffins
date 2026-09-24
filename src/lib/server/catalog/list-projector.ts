import type { AgencyPricing } from '../pricing/agency-pricing';
import type { CatalogPricing } from './catalog-pricing';
import type { CatalogRepository, ProductRow } from './catalog.repository';
import { CatalogDtoMapper } from './dto';
import type { VariantRepository } from './variant.repository';
import type { Visibility } from './visibility';
import type { ProductListItemDto } from '$lib/types/catalog';

function unique<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

/** Turns product rows into storefront cards: materials, lengths and the price "from". */
export class ProductListProjector {
	constructor(
		private readonly products: CatalogRepository,
		private readonly variants: VariantRepository,
		private readonly pricing: CatalogPricing,
		private readonly agency: AgencyPricing
	) {}

	project(rows: readonly ProductRow[], visibility: Visibility): ProductListItemDto[] {
		const ids = rows.map((row) => row.id);
		const variants = this.variants.findByProducts(ids, visibility);
		const minPrices = this.pricing.minBy(
			variants.map((variant) => ({ id: variant.id, key: variant.productId }))
		);
		const media = this.products.mediaByProducts(ids);
		const agencyPrices = this.agency.forProducts(ids);

		return rows.map((row) => {
			const own = variants.filter((variant) => variant.productId === row.id);
			return CatalogDtoMapper.toListItem(row, {
				variantCount: own.length,
				mediaIds: media.get(row.id) ?? [],
				materialTitles: unique(own.map((variant) => variant.materialTitle)),
				lengthsMm: unique(
					own.flatMap((variant) => (variant.lengthMm === null ? [] : [variant.lengthMm]))
				).sort((a, b) => a - b),
				minPriceMinor: minPrices?.get(row.id),
				agencyPriceMinor: agencyPrices?.get(row.id)
			});
		});
	}

	/**
	 * Ids ordered by the price the actor sees: the lowest personal price, and the agency price for
	 * a portal role without prices. Models without one go last in catalog order.
	 */
	orderByPrice(ids: readonly number[], dir: 'asc' | 'desc', visibility: Visibility): number[] {
		const variants = this.variants.findByProducts(ids, visibility);
		const minPrices =
			this.pricing.minBy(variants.map((variant) => ({ id: variant.id, key: variant.productId }))) ??
			this.agency.forProducts(ids) ??
			new Map<number, number>();
		const position = new Map(ids.map((id, index) => [id, index]));

		return [...ids].sort((a, b) => {
			const priceA = minPrices.get(a);
			const priceB = minPrices.get(b);
			const byCatalog = (position.get(a) ?? 0) - (position.get(b) ?? 0);
			if (priceA === undefined || priceB === undefined) {
				return priceA === priceB ? byCatalog : priceA === undefined ? 1 : -1;
			}
			const byPrice = dir === 'desc' ? priceB - priceA : priceA - priceB;
			return byPrice !== 0 ? byPrice : byCatalog;
		});
	}
}
