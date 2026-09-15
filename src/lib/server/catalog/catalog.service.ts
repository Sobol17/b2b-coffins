import { PolicyService } from '../auth/policy';
import { NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import { PersonalPriceResolver } from '../pricing/personal-price';
import { CatalogRepository, type Visibility } from './catalog.repository';
import { CatalogDtoMapper, type VariantPrice } from './dto';
import { VariantRepository, type VariantRow } from './variant.repository';
import type { ActorContext } from '$lib/types/actor';
import type {
	CatalogFilters,
	CategoryDto,
	ProductDto,
	ProductListItemDto,
	VariantDto
} from '$lib/types/catalog';
import type { ListQuery, Page } from '$lib/types/list';

/** Catalog read side for both contours. Prices are attached by role here, never in a template. */
export class CatalogService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly products: CatalogRepository = new CatalogRepository(),
		private readonly variants: VariantRepository = new VariantRepository(),
		private readonly pricing: PersonalPriceResolver = new PersonalPriceResolver()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError without `catalog.read`. */
	categories(): CategoryDto[] {
		this.assertRead();
		return this.products.listCategories(this.visibility());
	}

	/** @throws ForbiddenError without `catalog.read`. */
	list(query: ListQuery<CatalogFilters>): Page<ProductListItemDto> {
		this.assertRead();
		const visibility = this.visibility();
		const { rows, total } = this.products.listProducts(query, visibility);
		const ids = rows.map((row) => row.id);
		const counts = this.variants.countByProducts(ids, visibility);
		const media = this.products.mediaByProducts(ids);
		const minPrices = this.ctx.canSeePrices ? this.minPersonalPrices(ids, visibility) : undefined;

		return {
			rows: rows.map((row) =>
				CatalogDtoMapper.toListItem(row, {
					variantCount: counts.get(row.id) ?? 0,
					mediaIds: media.get(row.id) ?? [],
					minPriceMinor: minPrices?.get(row.id)
				})
			),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/**
	 * A hidden or deleted product answers as missing, not as forbidden: its existence is not leaked.
	 * @throws ForbiddenError without `catalog.read`, NotFoundError for an unknown or hidden product.
	 */
	get(productId: number): ProductDto {
		this.assertRead();
		const visibility = this.visibility();
		const product = this.products.findProduct(productId, visibility);
		if (!product) throw new NotFoundError('product');

		const variants = this.variants.findByProducts([product.id], visibility);
		const mediaIds = this.products.mediaByProducts([product.id]).get(product.id) ?? [];
		return CatalogDtoMapper.toProduct(product, mediaIds, this.projectVariants(variants));
	}

	private projectVariants(variants: readonly VariantRow[]): VariantDto[] {
		const variantIds = variants.map((variant) => variant.id);
		const optionRows = this.variants.findOptions(variantIds);
		const withPrices = this.ctx.canSeePrices;
		const prices = withPrices ? this.personalPrices(variantIds, this.ctx.canSeeCost) : undefined;
		const deltas = withPrices
			? this.variants.optionDeltas([...new Set(optionRows.map((row) => row.id))])
			: undefined;

		return variants.map((variant) =>
			CatalogDtoMapper.toVariant(
				variant,
				optionRows
					.filter((row) => row.variantId === variant.id)
					.map((row) => CatalogDtoMapper.toOption(row, deltas?.get(row.id))),
				prices?.get(variant.id)
			)
		);
	}

	/** Lowest personal price per product for the list card, over the variants the actor may see. */
	private minPersonalPrices(
		productIds: readonly number[],
		visibility: Visibility
	): Map<number, number> {
		const variants = this.variants.findByProducts(productIds, visibility);
		const prices = this.personalPrices(
			variants.map((variant) => variant.id),
			false
		);
		const minimum = new Map<number, number>();
		for (const variant of variants) {
			const price = prices.get(variant.id)?.priceMinor;
			const current = minimum.get(variant.productId);
			if (price !== undefined && (current === undefined || price < current)) {
				minimum.set(variant.productId, price);
			}
		}
		return minimum;
	}

	/**
	 * The price the actor's counterparty pays per variant, plus the cost for the owner. Called only
	 * for a role with prices: a price-blind actor never reaches a money column.
	 */
	private personalPrices(
		variantIds: readonly number[],
		withCost: boolean
	): Map<number, VariantPrice> {
		const stored = this.variants.findPrices(variantIds, withCost);
		const personal = this.pricing.resolve(
			this.ctx.counterpartyId,
			new Map([...stored].map(([id, row]) => [id, row.basePriceMinor]))
		);
		return new Map(
			[...stored].map(([id, row]) => [
				id,
				{ priceMinor: personal.get(id) ?? row.basePriceMinor, costPriceMinor: row.costPriceMinor }
			])
		);
	}

	private visibility(): Visibility {
		return { publishedOnly: !PolicyService.can(this.ctx, 'catalog.manage') };
	}

	private assertRead(): void {
		this.assert(PolicyService.can(this.ctx, 'catalog.read'), 'catalog.read');
	}
}
