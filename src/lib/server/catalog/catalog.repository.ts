import { and, asc, eq, inArray, isNull, like, or, type SQL } from 'drizzle-orm';
import { countExpression, offsetFor, orderByFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { categories, media, products } from '../db/schema';
import type { CatalogFilters } from '$lib/types/catalog';
import type { ListQuery } from '$lib/types/list';

export interface Visibility {
	/** Drafts and hidden positions exist only for the workshop that manages the catalog. */
	readonly publishedOnly: boolean;
}

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
	readonly productCount: number;
}

const PRODUCT_COLUMNS = {
	id: products.id,
	sku: products.sku,
	title: products.title,
	categoryId: products.categoryId,
	description: products.description
};

const SORTABLE = { title: products.title, sku: products.sku, sortOrder: products.sortOrder };

/** Products, categories and product media. The catalog is shared, so no counterparty filter here. */
export class CatalogRepository extends BaseRepository<typeof products> {
	constructor() {
		super(products);
	}

	listCategories(visibility: Visibility): CategoryRow[] {
		const counts = this.db()
			.select({ categoryId: products.categoryId, count: countExpression })
			.from(products)
			.where(this.visible(visibility))
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
		query: ListQuery<CatalogFilters>,
		visibility: Visibility
	): { rows: ProductRow[]; total: number } {
		const where = this.visible(visibility, this.matching(query));
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(products)
			.where(where)
			.all();
		const rows = this.db()
			.select(PRODUCT_COLUMNS)
			.from(products)
			.where(where)
			.orderBy(
				orderByFor({ ...query, dir: query.dir ?? 'asc' }, SORTABLE, products.sortOrder),
				asc(products.id)
			)
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	findProduct(
		id: number,
		visibility: Visibility
	): (ProductRow & { categoryTitle: string | null }) | undefined {
		const [row] = this.db()
			.select({ ...PRODUCT_COLUMNS, categoryTitle: categories.title })
			.from(products)
			.leftJoin(categories, eq(categories.id, products.categoryId))
			.where(this.visible(visibility, eq(products.id, id)))
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

	private visible(visibility: Visibility, extra?: SQL): SQL | undefined {
		return and(
			isNull(products.deletedAt),
			visibility.publishedOnly ? eq(products.isPublished, true) : undefined,
			extra
		);
	}

	private matching(query: ListQuery<CatalogFilters>): SQL | undefined {
		const categoryId = query.filters?.categoryId;
		// Bound parameters, never string-built SQL: the search text is user input.
		const pattern = query.search === undefined ? undefined : `%${query.search}%`;
		return and(
			categoryId === undefined ? undefined : eq(products.categoryId, categoryId),
			pattern === undefined
				? undefined
				: or(like(products.title, pattern), like(products.sku, pattern))
		);
	}
}
