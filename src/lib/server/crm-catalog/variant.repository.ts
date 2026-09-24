import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	bomNorms,
	bomVersions,
	dictItems,
	productOptions,
	productVariants,
	stockItems
} from '../db/schema';
import type { CrmVariantDto } from '$lib/types/crm-catalog';
import type { CompatibilityInput, VariantInput } from '$lib/validation/crm-catalog';

const VARIANT = {
	id: productVariants.id,
	productId: productVariants.productId,
	sku: productVariants.sku,
	sizeCode: productVariants.sizeCode,
	materialId: productVariants.materialId,
	lengthMm: productVariants.lengthMm,
	widthMm: productVariants.widthMm,
	heightMm: productVariants.heightMm,
	weightG: productVariants.weightG,
	basePriceMinor: productVariants.basePriceMinor,
	stockItemId: productVariants.stockItemId,
	isPublished: productVariants.isPublished,
	deletedAt: productVariants.deletedAt
};

/** Separate cost select prevents a manager's query from touching that column. */
export class ManagedVariantRepository extends BaseRepository<typeof productVariants> {
	constructor() {
		super(productVariants);
	}

	variants(productId: number, withCost: boolean, tx?: Tx): CrmVariantDto[] {
		const rows = this.db(tx)
			.select(VARIANT)
			.from(productVariants)
			.where(eq(productVariants.productId, productId))
			.orderBy(asc(productVariants.id))
			.all();
		const costs = withCost
			? this.costs(
					rows.map((row) => row.id),
					tx
				)
			: new Map<number, number>();
		return rows.map((row) => ({
			id: row.id,
			productId: row.productId,
			sku: row.sku,
			sizeCode: row.sizeCode,
			materialId: row.materialId,
			lengthMm: row.lengthMm,
			widthMm: row.widthMm,
			heightMm: row.heightMm,
			weightG: row.weightG,
			basePriceMinor: row.basePriceMinor,
			stockItemId: row.stockItemId,
			isPublished: row.isPublished,
			isDeleted: row.deletedAt !== null,
			options: this.compatibility(row.id, tx),
			activeBomNorms: this.activeNorms(row.id, tx),
			...(withCost ? { costPriceMinor: costs.get(row.id) ?? 0 } : {})
		}));
	}

	find(id: number, tx?: Tx) {
		return this.db(tx)
			.select(VARIANT)
			.from(productVariants)
			.where(eq(productVariants.id, id))
			.get();
	}

	skuTaken(sku: string, exceptId?: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: productVariants.id })
				.from(productVariants)
				.where(
					and(
						eq(productVariants.sku, sku),
						exceptId === undefined ? undefined : ne(productVariants.id, exceptId)
					)
				)
				.get() !== undefined
		);
	}

	materialActive(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: dictItems.id })
				.from(dictItems)
				.where(
					and(eq(dictItems.id, id), eq(dictItems.dict, 'material'), eq(dictItems.isActive, true))
				)
				.get() !== undefined
		);
	}

	stockProductActive(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: stockItems.id })
				.from(stockItems)
				.where(
					and(eq(stockItems.id, id), eq(stockItems.kind, 'product'), eq(stockItems.isActive, true))
				)
				.get() !== undefined
		);
	}

	stockComponentActive(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: stockItems.id })
				.from(stockItems)
				.where(
					and(
						eq(stockItems.id, id),
						eq(stockItems.kind, 'component'),
						eq(stockItems.isActive, true)
					)
				)
				.get() !== undefined
		);
	}

	insert(input: VariantInput, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(productVariants)
			.values(input)
			.returning({ id: productVariants.id })
			.all();
		if (!row) throw new Error('failed to insert variant');
		return row.id;
	}

	update(id: number, input: VariantInput, tx: Tx): void {
		this.db(tx).update(productVariants).set(input).where(eq(productVariants.id, id)).run();
	}

	setPublished(id: number, isPublished: boolean, tx: Tx): void {
		this.db(tx)
			.update(productVariants)
			.set({ isPublished })
			.where(eq(productVariants.id, id))
			.run();
	}

	softDelete(id: number, tx: Tx): void {
		this.db(tx)
			.update(productVariants)
			.set({ isPublished: false, deletedAt: new Date() })
			.where(eq(productVariants.id, id))
			.run();
	}

	activeCount(productId: number, exceptId?: number, tx?: Tx): number {
		return this.db(tx)
			.select({ id: productVariants.id })
			.from(productVariants)
			.where(
				and(
					eq(productVariants.productId, productId),
					eq(productVariants.isPublished, true),
					isNull(productVariants.deletedAt),
					exceptId === undefined ? undefined : ne(productVariants.id, exceptId)
				)
			)
			.all().length;
	}

	compatibility(variantId: number, tx?: Tx) {
		return this.db(tx)
			.select({ optionId: productOptions.optionId, isDefault: productOptions.isDefault })
			.from(productOptions)
			.where(eq(productOptions.variantId, variantId))
			.orderBy(asc(productOptions.optionId))
			.all();
	}

	setCompatibility(input: CompatibilityInput, tx: Tx): void {
		this.db(tx).delete(productOptions).where(eq(productOptions.variantId, input.variantId)).run();
		if (input.options.length)
			this.db(tx)
				.insert(productOptions)
				.values(input.options.map((row) => ({ ...row, variantId: input.variantId })))
				.run();
	}

	activeNorms(variantId: number, tx?: Tx) {
		return this.db(tx)
			.select({
				id: bomNorms.id,
				componentId: bomNorms.componentId,
				qtyPerUnitMilli: bomNorms.qtyPerUnitMilli
			})
			.from(bomNorms)
			.innerJoin(bomVersions, eq(bomVersions.id, bomNorms.bomVersionId))
			.where(and(eq(bomNorms.variantId, variantId), eq(bomVersions.isActive, true)))
			.orderBy(asc(bomNorms.id))
			.all();
	}

	private costs(ids: number[], tx?: Tx): Map<number, number> {
		if (!ids.length) return new Map();
		const rows = this.db(tx)
			.select({ id: productVariants.id, cost: productVariants.costPriceMinor })
			.from(productVariants)
			.where(inArray(productVariants.id, ids))
			.all();
		return new Map(rows.flatMap((row) => (row.cost === null ? [] : [[row.id, row.cost]])));
	}
}
