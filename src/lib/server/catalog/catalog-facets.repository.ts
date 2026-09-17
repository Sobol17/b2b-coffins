import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { dictItems, options, productOptions, productVariants, products } from '../db/schema';
import { productVisible, variantVisible, type Visibility } from './visibility';

export interface FacetRows {
	readonly materials: { id: number; title: string; productCount: number }[];
	readonly colors: { id: number; title: string }[];
	readonly minLengthMm: number | null;
	readonly maxLengthMm: number | null;
}

/** Filter values of the storefront, taken only from variants the actor can actually see. */
export class CatalogFacetsRepository extends BaseRepository<typeof productVariants> {
	constructor() {
		super(productVariants);
	}

	facets(categoryIds: readonly number[] | undefined, visibility: Visibility): FacetRows {
		const scope = and(
			productVisible(visibility),
			variantVisible(visibility),
			categoryIds === undefined ? undefined : inArray(products.categoryId, [...categoryIds])
		);

		const materials = this.db()
			.select({
				id: dictItems.id,
				title: dictItems.title,
				productCount: sql<number>`count(distinct ${products.id})`
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(scope)
			.groupBy(dictItems.id, dictItems.title, dictItems.sortOrder)
			.orderBy(asc(dictItems.sortOrder))
			.all();

		const colors = this.db()
			.selectDistinct({ id: options.id, title: options.title })
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(productOptions, eq(productOptions.variantId, productVariants.id))
			.innerJoin(options, eq(options.id, productOptions.optionId))
			.where(and(scope, eq(options.kind, 'color'), eq(options.isActive, true)))
			.orderBy(asc(options.title))
			.all();

		const [bounds] = this.db()
			.select({
				min: sql<number | null>`min(${productVariants.lengthMm})`,
				max: sql<number | null>`max(${productVariants.lengthMm})`
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(scope)
			.all();

		return {
			materials,
			colors,
			minLengthMm: bounds?.min ?? null,
			maxLengthMm: bounds?.max ?? null
		};
	}
}
