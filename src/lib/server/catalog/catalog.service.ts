import { PolicyService } from '../auth/policy';
import { NotFoundError } from '../core/errors';
import { offsetFor } from '../core/list';
import { BaseService } from '../core/service';
import { CatalogFacetsRepository } from './catalog-facets.repository';
import { CatalogPricing } from './catalog-pricing';
import { CatalogRepository, type ProductMatch, type ProductRow } from './catalog.repository';
import { CategoryTree } from './category-tree';
import { CatalogDtoMapper } from './dto';
import { ProductListProjector } from './list-projector';
import { VariantRepository, type VariantRow } from './variant.repository';
import type { Visibility } from './visibility';
import type { ActorContext } from '$lib/types/actor';
import {
	CATALOG_SORTS,
	type CatalogFacetsDto,
	type CatalogFilters,
	type CatalogSort,
	type CategoryDto,
	type CategoryGroupDto,
	type ProductDto,
	type ProductListItemDto,
	type VariantDto
} from '$lib/types/catalog';
import type { ListQuery, Page } from '$lib/types/list';

export interface CategoryViewDto {
	readonly category: CategoryDto;
	/** Root first, the category itself last. */
	readonly path: readonly CategoryDto[];
	readonly children: readonly CategoryDto[];
}

function inOrder(rows: readonly ProductRow[], ids: readonly number[]): ProductRow[] {
	const byId = new Map(rows.map((row) => [row.id, row]));
	return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Catalog read side for both contours. Prices are attached by role here, never in a template. */
export class CatalogService extends BaseService {
	private readonly projector: ProductListProjector;

	constructor(
		ctx: ActorContext,
		private readonly products: CatalogRepository = new CatalogRepository(),
		private readonly variants: VariantRepository = new VariantRepository(),
		private readonly facetRows: CatalogFacetsRepository = new CatalogFacetsRepository(),
		private readonly pricing: CatalogPricing = new CatalogPricing(ctx, variants)
	) {
		super(ctx);
		this.projector = new ProductListProjector(products, variants, pricing);
	}

	/** Every category with the count of its tree and the lowest personal price inside it. */
	categories(): CategoryDto[] {
		this.assertRead();
		const visibility = this.visibility();
		const tree = this.tree(visibility);
		const minPrices = this.pricing.minBy(
			this.variants
				.withCategories(visibility)
				.flatMap((variant) =>
					variant.categoryId === null
						? []
						: tree.ancestorsAndSelf(variant.categoryId).map((key) => ({ id: variant.id, key }))
				)
		);
		return tree.rows.map((row) =>
			CatalogDtoMapper.toCategory(row, tree.totalCount(row.id), minPrices?.get(row.id))
		);
	}

	/** Top-level groups for the catalog page. A group without subcategories shows its first models. */
	showcase(limit = 6): CategoryGroupDto[] {
		const all = this.categories();
		const tree = this.tree(this.visibility());
		return tree.roots().flatMap((root) => {
			const category = all.find((candidate) => candidate.id === root.id);
			if (!category) return [];
			const children = all.filter((candidate) => candidate.parentId === root.id);
			const showcase =
				children.length > 0
					? []
					: this.list({ page: 1, perPage: limit, filters: { categoryId: root.id } }).rows;
			return [{ category, children, showcase }];
		});
	}

	/** @throws NotFoundError for an unknown category. */
	category(categoryId: number): CategoryViewDto {
		const all = this.categories();
		const byId = new Map(all.map((category) => [category.id, category]));
		const current = byId.get(categoryId);
		if (!current) throw new NotFoundError('category');
		const tree = this.tree(this.visibility());
		return {
			category: current,
			path: tree.pathTo(categoryId).flatMap((row) => byId.get(row.id) ?? []),
			children: all.filter((category) => category.parentId === categoryId)
		};
	}

	/** @throws ForbiddenError without `catalog.read`. */
	list(query: ListQuery<CatalogFilters>): Page<ProductListItemDto> {
		this.assertRead();
		const visibility = this.visibility();
		const match = this.match(query, visibility);
		const sort = this.sortOf(query.sort);
		const dir = query.dir ?? 'asc';

		if (sort === 'price') {
			const ids = this.projector.orderByPrice(
				this.products.matchingIds(match, visibility),
				dir,
				visibility
			);
			const pageIds = ids.slice(offsetFor(query), offsetFor(query) + query.perPage);
			const rows = inOrder(this.products.findByIds(pageIds), pageIds);
			return this.page(query, this.projector.project(rows, visibility), ids.length);
		}

		const page = { page: query.page, perPage: query.perPage, sort, dir };
		const { rows, total } = this.products.listProducts(match, page, visibility);
		return this.page(query, this.projector.project(rows, visibility), total);
	}

	/** Filter values for a category tree, or the whole catalog. */
	facets(categoryId?: number): CatalogFacetsDto {
		this.assertRead();
		const visibility = this.visibility();
		const ids =
			categoryId === undefined ? undefined : this.tree(visibility).descendantsAndSelf(categoryId);
		const rows = this.facetRows.facets(ids, visibility);
		return {
			materials: rows.materials,
			finishes: rows.finishes,
			lengthMm: { min: rows.minLengthMm, max: rows.maxLengthMm }
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

	/** Other models of the same category, for the "similar positions" row of the product page. */
	similar(productId: number, limit = 4): ProductListItemDto[] {
		this.assertRead();
		const product = this.products.findProduct(productId, this.visibility());
		if (!product || product.categoryId === null) return [];
		const page = this.list({
			page: 1,
			perPage: limit + 1,
			filters: { categoryId: product.categoryId }
		});
		return page.rows.filter((item) => item.id !== productId).slice(0, limit);
	}

	private projectVariants(variants: readonly VariantRow[]): VariantDto[] {
		const variantIds = variants.map((variant) => variant.id);
		const optionRows = this.variants.findOptions(variantIds);
		const prices = this.pricing.pricesFor(variantIds, true);
		const deltas = this.ctx.canSeePrices
			? this.variants.optionDeltas([...new Set(optionRows.map((row) => row.id))])
			: undefined;
		const stock = this.variants.stockByVariants(variantIds);

		return variants.map((variant) =>
			CatalogDtoMapper.toVariant(
				variant,
				optionRows
					.filter((row) => row.variantId === variant.id)
					.map((row) => CatalogDtoMapper.toOption(row, deltas?.get(row.id))),
				prices?.get(variant.id),
				Math.max(0, stock.get(variant.id) ?? 0)
			)
		);
	}

	private match(query: ListQuery<CatalogFilters>, visibility: Visibility): ProductMatch {
		const categoryId = query.filters?.categoryId;
		return {
			search: query.search,
			filters: query.filters,
			categoryIds:
				categoryId === undefined ? undefined : this.tree(visibility).descendantsAndSelf(categoryId)
		};
	}

	private sortOf(sort: string | undefined): CatalogSort {
		const known = CATALOG_SORTS.find((candidate) => candidate === sort) ?? 'sortOrder';
		// Ordering by price would still tell a price-blind role which model costs more.
		return known === 'price' && !this.ctx.canSeePrices ? 'sortOrder' : known;
	}

	private page(
		query: ListQuery<CatalogFilters>,
		rows: ProductListItemDto[],
		total: number
	): Page<ProductListItemDto> {
		return { rows, total, page: query.page, perPage: query.perPage };
	}

	private tree(visibility: Visibility): CategoryTree {
		return new CategoryTree(this.products.listCategories(visibility));
	}

	private visibility(): Visibility {
		return { publishedOnly: !PolicyService.can(this.ctx, 'catalog.manage') };
	}

	private assertRead(): void {
		this.assert(PolicyService.can(this.ctx, 'catalog.read'), 'catalog.read');
	}
}
