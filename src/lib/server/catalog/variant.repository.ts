import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { dictItems, options, productOptions, productVariants } from '../db/schema';
import type { Visibility } from './catalog.repository';
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

/**
 * Variants, the compatibility matrix and prices. Descriptive reads never touch a money column;
 * prices live in separate methods the service calls only for a role allowed to see them.
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
			.where(this.visible(visibility, inArray(productVariants.productId, [...productIds])))
			.orderBy(asc(productVariants.lengthMm), asc(productVariants.sku))
			.all();
	}

	countByProducts(productIds: readonly number[], visibility: Visibility): Map<number, number> {
		if (productIds.length === 0) return new Map();
		const rows = this.db()
			.select({ productId: productVariants.productId, count: countExpression })
			.from(productVariants)
			.where(this.visible(visibility, inArray(productVariants.productId, [...productIds])))
			.groupBy(productVariants.productId)
			.all();
		return new Map(rows.map((row) => [row.productId, row.count]));
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

	minPrices(productIds: readonly number[], visibility: Visibility): Map<number, number> {
		if (productIds.length === 0) return new Map();
		const rows = this.db()
			.select({
				productId: productVariants.productId,
				minPriceMinor: sql<number>`min(${productVariants.basePriceMinor})`
			})
			.from(productVariants)
			.where(this.visible(visibility, inArray(productVariants.productId, [...productIds])))
			.groupBy(productVariants.productId)
			.all();
		return new Map(rows.map((row) => [row.productId, row.minPriceMinor]));
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

	private visible(visibility: Visibility, extra: SQL): SQL | undefined {
		return and(
			isNull(productVariants.deletedAt),
			visibility.publishedOnly ? eq(productVariants.isPublished, true) : undefined,
			extra
		);
	}
}
