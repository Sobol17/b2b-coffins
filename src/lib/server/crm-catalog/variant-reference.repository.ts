import { and, eq, inArray, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { dictItems, productVariants, stockItems, workTypes } from '../db/schema';

/** Reference checks shared by variant and colour writes. */
export class VariantReferenceRepository extends BaseRepository<typeof productVariants> {
	constructor() {
		super(productVariants);
	}

	hasPayrollRates(productId: number, materialIds: number[], tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: workTypes.id })
				.from(workTypes)
				.innerJoin(productVariants, eq(productVariants.id, workTypes.variantId))
				.where(
					and(
						eq(productVariants.productId, productId),
						inArray(productVariants.materialId, materialIds)
					)
				)
				.get() !== undefined
		);
	}

	sizeActive(code: string, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: dictItems.id })
				.from(dictItems)
				.where(
					and(
						eq(dictItems.code, code),
						eq(dictItems.dict, 'coffin_size'),
						eq(dictItems.isActive, true)
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
					and(
						eq(stockItems.id, id),
						eq(stockItems.kind, 'product'),
						eq(stockItems.isActive, true),
						isNull(stockItems.deletedAt)
					)
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
						eq(stockItems.isActive, true),
						isNull(stockItems.deletedAt)
					)
				)
				.get() !== undefined
		);
	}
}
