import {
	and,
	asc,
	desc,
	eq,
	exists,
	gte,
	inArray,
	like,
	lte,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import {
	categories,
	media,
	productOptions,
	productVariants,
	products,
	stockMoves
} from '../db/schema';
import { productVisible, variantVisible, type Visibility } from './visibility';
import type { CatalogFilters } from '$lib/types/catalog';

export type { Visibility } from './visibility';

export interface ProductRow {
	readonly id: number;
	readonly sku: string;
	readonly title: string;
	readonly categoryId: number | null;
	readonly description: string | null;
}

export interface CategoryRow {
	readonly id: number;
	readonly title: string;
	readonly parentId: number | null;
	/** Visible products placed directly in this category. */
	readonly productCount: number;
}

/** What the storefront matches products by. Category ids already include the subcategories. */
export interface ProductMatch {
	readonly categoryIds?: readonly number[] | undefined;
	readonly search?: string | undefined;
	readonly filters?: CatalogFilters | undefined;
}

export interface ProductPage {
	readonly page: number;
	readonly perPage: number;
	readonly sort: 'sortOrder' | 'title';
	readonly dir: 'asc' | 'desc';
}

const PRODUCT_COLUMNS = {
	id: products.id,
	sku: products.sku,
	title: products.title,
	categoryId: products.categoryId,
	description: products.description
};

/** Products, categories and product media. The catalog is shared, so no counterparty filter here. */
export class CatalogRepository extends BaseRepository<typeof products> {
	constructor() {
		super(products);
	}

	listCategories(visibility: Visibility): CategoryRow[] {
		const counts = this.db()
			.select({ categoryId: products.categoryId, count: countExpression })
			.from(products)
			.where(productVisible(visibility))
			.groupBy(products.categoryId)
			.all();
		const byCategory = new Map(counts.map((row) => [row.categoryId, row.count]));

		return this.db()
			.select({ id: categories.id, title: categories.title, parentId: categories.parentId })
			.from(categories)
			.orderBy(asc(categories.sortOrder), asc(categories.title))
			.all()
			.map((row) => ({ ...row, productCount: byCategory.get(row.id) ?? 0 }));
	}

	listProducts(
		match: ProductMatch,
		page: ProductPage,
		visibility: Visibility
	): { rows: ProductRow[]; total: number } {
		const where = this.matching(match, visibility);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(products)
			.where(where)
			.all();
		const column = page.sort === 'title' ? products.title : products.sortOrder;
		const rows = this.db()
			.select(PRODUCT_COLUMNS)
			.from(products)
			.where(where)
			.orderBy(page.dir === 'desc' ? desc(column) : asc(column), asc(products.id))
			.limit(page.perPage)
			.offset(offsetFor({ page: page.page, perPage: page.perPage }))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	/** Every matching id in catalog order, for a sort the database cannot do (personal price). */
	matchingIds(match: ProductMatch, visibility: Visibility): number[] {
		return this.db()
			.select({ id: products.id })
			.from(products)
			.where(this.matching(match, visibility))
			.orderBy(asc(products.sortOrder), asc(products.id))
			.all()
			.map((row) => row.id);
	}

	/** Of the given models, the ones the actor may see. Guards a write that carries model ids. */
	visibleIds(ids: readonly number[], visibility: Visibility): Set<number> {
		if (ids.length === 0) return new Set();
		const rows = this.db()
			.select({ id: products.id })
			.from(products)
			.where(and(productVisible(visibility), inArray(products.id, [...ids])))
			.all();
		return new Set(rows.map((row) => row.id));
	}

	findByIds(ids: readonly number[]): ProductRow[] {
		if (ids.length === 0) return [];
		return this.db()
			.select(PRODUCT_COLUMNS)
			.from(products)
			.where(inArray(products.id, [...ids]))
			.all();
	}

	findProduct(
		id: number,
		visibility: Visibility
	): (ProductRow & { categoryTitle: string | null }) | undefined {
		const [row] = this.db()
			.select({ ...PRODUCT_COLUMNS, categoryTitle: categories.title })
			.from(products)
			.leftJoin(categories, eq(categories.id, products.categoryId))
			.where(and(productVisible(visibility), eq(products.id, id)))
			.all();
		return row;
	}

	/** Media ids per product in display order; the first one is the cover. */
	mediaByProducts(productIds: readonly number[]): Map<number, number[]> {
		const byProduct = new Map<number, number[]>();
		if (productIds.length === 0) return byProduct;
		const rows = this.db()
			.select({ id: media.id, ownerId: media.ownerId })
			.from(media)
			.where(and(eq(media.ownerScope, 'product'), inArray(media.ownerId, [...productIds])))
			.orderBy(asc(media.sortOrder), asc(media.id))
			.all();
		for (const row of rows) {
			if (row.ownerId === null) continue;
			byProduct.set(row.ownerId, [...(byProduct.get(row.ownerId) ?? []), row.id]);
		}
		return byProduct;
	}

	private matching(match: ProductMatch, visibility: Visibility): SQL | undefined {
		// Bound parameters, never string-built SQL: the search text is user input.
		const pattern = match.search === undefined ? undefined : `%${match.search}%`;
		return and(
			productVisible(visibility),
			match.categoryIds === undefined
				? undefined
				: inArray(products.categoryId, [...match.categoryIds]),
			pattern === undefined
				? undefined
				: or(like(products.title, pattern), like(products.sku, pattern)),
			this.variantMatch(match.filters, visibility)
		);
	}

	/**
	 * One variant has to meet every filter at once: "oak" and "200 cm" mean an oak variant of
	 * 200 cm, not an oak model that also comes as a 200 cm pine one.
	 */
	private variantMatch(
		filters: CatalogFilters | undefined,
		visibility: Visibility
	): SQL | undefined {
		if (!filters) return undefined;
		const conditions = [
			filters.materialIds?.length
				? inArray(productVariants.materialId, [...filters.materialIds])
				: undefined,
			filters.lengthFromMm === undefined
				? undefined
				: gte(productVariants.lengthMm, filters.lengthFromMm),
			filters.lengthToMm === undefined
				? undefined
				: lte(productVariants.lengthMm, filters.lengthToMm),
			filters.colorOptionIds?.length
				? exists(
						this.db()
							.select({ one: sql`1` })
							.from(productOptions)
							.where(
								and(
									eq(productOptions.variantId, productVariants.id),
									inArray(productOptions.optionId, [...filters.colorOptionIds])
								)
							)
					)
				: undefined,
			// Balance is the sum of moves (tech.md 5.7): there is no stored figure to read instead.
			filters.inStock
				? sql`(select coalesce(sum(${stockMoves.qty}), 0) from ${stockMoves} where ${stockMoves.stockItemId} = ${productVariants.stockItemId}) > 0`
				: undefined
		].filter((condition): condition is SQL => condition !== undefined);
		if (conditions.length === 0) return undefined;

		return exists(
			this.db()
				.select({ one: sql`1` })
				.from(productVariants)
				.where(
					and(eq(productVariants.productId, products.id), variantVisible(visibility), ...conditions)
				)
		);
	}
}
