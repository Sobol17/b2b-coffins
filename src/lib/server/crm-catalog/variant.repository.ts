import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { VariantReferenceRepository } from './variant-reference.repository';
import type { Tx } from '../db/client';
import { dictItems, productOptions, productVariants, products, stockItems } from '../db/schema';
import type { CrmCatalogChoicesDto, CrmVariantDto } from '$lib/types/crm-catalog';
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
	basePriceMinor: products.basePriceMinor,
	stockItemId: productVariants.stockItemId,
	isPublished: productVariants.isPublished,
	deletedAt: productVariants.deletedAt
};

/** Separate cost select prevents a manager's query from touching that column. */
export class ManagedVariantRepository extends VariantReferenceRepository {
	constructor() {
		super();
	}

	choices(): CrmCatalogChoicesDto {
		const materials = this.db()
			.select({ id: dictItems.id, title: dictItems.title })
			.from(dictItems)
			.where(and(eq(dictItems.dict, 'material'), eq(dictItems.isActive, true)))
			.orderBy(asc(dictItems.title))
			.all();
		const items = this.db()
			.select({
				id: stockItems.id,
				code: stockItems.code,
				title: stockItems.title,
				kind: stockItems.kind
			})
			.from(stockItems)
			.where(and(eq(stockItems.isActive, true), isNull(stockItems.deletedAt)))
			.orderBy(asc(stockItems.title))
			.all();
		const variants = this.db()
			.select({ id: productVariants.id, sku: productVariants.sku, productTitle: products.title })
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(and(isNull(productVariants.deletedAt), isNull(products.deletedAt)))
			.orderBy(asc(products.title), asc(productVariants.sku))
			.all();
		const sizes = this.db()
			.select({ code: dictItems.code, title: dictItems.title })
			.from(dictItems)
			.where(and(eq(dictItems.dict, 'coffin_size'), eq(dictItems.isActive, true)))
			.orderBy(asc(dictItems.sortOrder), asc(dictItems.title), asc(dictItems.id))
			.all();
		return {
			materials,
			sizes,
			stockProducts: items.filter((row) => row.kind === 'product'),
			stockComponents: items.filter((row) => row.kind === 'component'),
			variants
		};
	}

	variants(productId: number, withCost: boolean, tx?: Tx): CrmVariantDto[] {
		const rows = this.db(tx)
			.select(VARIANT)
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
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
			...(withCost ? { costPriceMinor: costs.get(row.id) ?? 0 } : {})
		}));
	}

	find(id: number, tx?: Tx) {
		return this.db(tx)
			.select(VARIANT)
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
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

	setModelPrice(id: number, price: number, tx: Tx): void {
		this.db(tx).update(products).set({ basePriceMinor: price }).where(eq(products.id, id)).run();
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

	private costs(ids: number[], tx?: Tx): Map<number, number> {
		if (!ids.length) return new Map();
		const rows = this.db(tx)
			.select({ id: productVariants.id, cost: stockItems.costPriceMinor })
			.from(productVariants)
			.leftJoin(stockItems, eq(stockItems.id, productVariants.stockItemId))
			.where(inArray(productVariants.id, ids))
			.all();
		return new Map(rows.flatMap((row) => (row.cost === null ? [] : [[row.id, row.cost]])));
	}
}
