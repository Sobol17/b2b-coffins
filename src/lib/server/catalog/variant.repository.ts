import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import {
	categories,
	dictItems,
	options,
	productOptions,
	productVariants,
	products,
	stockMoves
} from '../db/schema';
import { productVisible, variantVisible, type Visibility } from './visibility';
import type { OptionKind } from '$lib/types/catalog';

export interface VariantRow {
	readonly id: number;
	readonly productId: number;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly lengthMm: number | null;
	readonly widthMm: number | null;
	readonly heightMm: number | null;
	readonly weightG: number | null;
}

export interface OptionRow {
	readonly variantId: number;
	readonly id: number;
	readonly kind: OptionKind;
	readonly title: string;
	readonly isDefault: boolean;
}

export interface PriceRow {
	readonly basePriceMinor: number;
	readonly costPriceMinor?: number;
}

export interface VariantCategoryRow {
	readonly id: number;
	readonly productId: number;
	readonly categoryId: number | null;
}

export interface PriceListVariantRow {
	readonly id: number;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly lengthMm: number | null;
	readonly productTitle: string;
	readonly categoryTitle: string | null;
}

/**
 * Variants, the compatibility matrix, stock and prices. Descriptive reads never touch a money
 * column; prices live in separate methods called only for a role allowed to see them.
 */
export class VariantRepository extends BaseRepository<typeof productVariants> {
	constructor() {
		super(productVariants);
	}

	findByProducts(productIds: readonly number[], visibility: Visibility): VariantRow[] {
		if (productIds.length === 0) return [];
		return this.db()
			.select({
				id: productVariants.id,
				productId: productVariants.productId,
				sku: productVariants.sku,
				sizeCode: productVariants.sizeCode,
				materialTitle: dictItems.title,
				lengthMm: productVariants.lengthMm,
				widthMm: productVariants.widthMm,
				heightMm: productVariants.heightMm,
				weightG: productVariants.weightG
			})
			.from(productVariants)
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(and(variantVisible(visibility), inArray(productVariants.productId, [...productIds])))
			.orderBy(asc(productVariants.lengthMm), asc(productVariants.sku))
			.all();
	}

	/** Visible variants with the category of their model, for per-category figures. */
	withCategories(visibility: Visibility): VariantCategoryRow[] {
		return this.db()
			.select({
				id: productVariants.id,
				productId: productVariants.productId,
				categoryId: products.categoryId
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(and(productVisible(visibility), variantVisible(visibility)))
			.all();
	}

	findAllForPriceList(visibility: Visibility): PriceListVariantRow[] {
		return this.db()
			.select({
				id: productVariants.id,
				sku: productVariants.sku,
				sizeCode: productVariants.sizeCode,
				materialTitle: dictItems.title,
				lengthMm: productVariants.lengthMm,
				productTitle: products.title,
				categoryTitle: categories.title
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.leftJoin(categories, eq(categories.id, products.categoryId))
			.where(and(productVisible(visibility), variantVisible(visibility)))
			.orderBy(
				asc(categories.sortOrder),
				asc(products.sortOrder),
				asc(productVariants.lengthMm),
				asc(productVariants.sku)
			)
			.all();
	}

	/** Stock balance per variant: the sum of the moves of its stock item (tech.md 5.7). */
	stockByVariants(variantIds: readonly number[]): Map<number, number> {
		if (variantIds.length === 0) return new Map();
		const rows = this.db()
			.select({
				id: productVariants.id,
				qty: sql<number>`coalesce(sum(${stockMoves.qty}), 0)`
			})
			.from(productVariants)
			.leftJoin(stockMoves, eq(stockMoves.stockItemId, productVariants.stockItemId))
			.where(inArray(productVariants.id, [...variantIds]))
			.groupBy(productVariants.id)
			.all();
		return new Map(rows.map((row) => [row.id, row.qty]));
	}

	/** Active options allowed per variant, defaults first. */
	findOptions(variantIds: readonly number[]): OptionRow[] {
		if (variantIds.length === 0) return [];
		return this.db()
			.select({
				variantId: productOptions.variantId,
				id: options.id,
				kind: options.kind,
				title: options.title,
				isDefault: productOptions.isDefault
			})
			.from(productOptions)
			.innerJoin(options, eq(options.id, productOptions.optionId))
			.where(and(inArray(productOptions.variantId, [...variantIds]), eq(options.isActive, true)))
			.orderBy(asc(options.kind), sql`${productOptions.isDefault} desc`, asc(options.title))
			.all();
	}

	findPrices(variantIds: readonly number[], withCost: boolean): Map<number, PriceRow> {
		if (variantIds.length === 0) return new Map();
		const where = inArray(productVariants.id, [...variantIds]);
		if (!withCost) {
			const rows = this.db()
				.select({ id: productVariants.id, basePriceMinor: productVariants.basePriceMinor })
				.from(productVariants)
				.where(where)
				.all();
			return new Map(rows.map((row) => [row.id, { basePriceMinor: row.basePriceMinor }]));
		}
		const rows = this.db()
			.select({
				id: productVariants.id,
				basePriceMinor: productVariants.basePriceMinor,
				costPriceMinor: productVariants.costPriceMinor
			})
			.from(productVariants)
			.where(where)
			.all();
		return new Map(
			rows.map((row) => [
				row.id,
				{ basePriceMinor: row.basePriceMinor, costPriceMinor: row.costPriceMinor }
			])
		);
	}

	optionDeltas(optionIds: readonly number[]): Map<number, number> {
		if (optionIds.length === 0) return new Map();
		const rows = this.db()
			.select({ id: options.id, priceDeltaMinor: options.priceDeltaMinor })
			.from(options)
			.where(inArray(options.id, [...optionIds]))
			.all();
		return new Map(rows.map((row) => [row.id, row.priceDeltaMinor]));
	}
}
