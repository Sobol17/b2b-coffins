import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { dictItems, products, productVariants, workTypes } from '../db/schema';
import type { WorkTypeDto } from '$lib/types/crm-payroll';
import { WORK_ROLES, type WorkRole } from '$lib/types/roles';

const VARIANT_LABEL = sql<
	string | null
>`${products.sku} || ' · ' || ${products.title} || ' · ' || ${dictItems.title}`;
const POSITION_ID = sql<number>`(select min(v.id) from product_variants v where v.product_id = "product_variants"."product_id" and v.material_id = "product_variants"."material_id")`;

const COLUMNS = {
	id: workTypes.id,
	title: workTypes.title,
	rateMinor: workTypes.rateMinor,
	roleCode: workTypes.roleCode,
	variantId: workTypes.variantId,
	variantLabel: VARIANT_LABEL,
	isActive: workTypes.isActive
};

// Works follow the shop floor (tech.md v1.61): carpenter, grinder, painter, upholsterer, then general.
const FLOOR_ORDER = sql`case ${workTypes.roleCode} ${sql.join(
	WORK_ROLES.map((role, index) => sql`when ${role} then ${index}`),
	sql` `
)} else ${WORK_ROLES.length} end`;

/** Works and their prices (`work_types`, tech.md v1.48): a short list, read whole. */
export class WorkTypeRepository extends BaseRepository<typeof workTypes> {
	constructor() {
		super(workTypes);
	}

	all(tx?: Tx, includeHistorical = false): WorkTypeDto[] {
		return this.db(tx)
			.select(COLUMNS)
			.from(workTypes)
			.leftJoin(productVariants, eq(productVariants.id, workTypes.variantId))
			.leftJoin(products, eq(products.id, productVariants.productId))
			.leftJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(
				includeHistorical
					? undefined
					: sql`(${workTypes.variantId} is null or ${workTypes.variantId} = ${POSITION_ID})`
			)
			.orderBy(desc(workTypes.isActive), FLOOR_ORDER, asc(workTypes.title), asc(workTypes.id))
			.all();
	}

	find(id: number, tx?: Tx): WorkTypeDto | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(workTypes)
			.leftJoin(productVariants, eq(productVariants.id, workTypes.variantId))
			.leftJoin(products, eq(products.id, productVariants.productId))
			.leftJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(eq(workTypes.id, id))
			.all();
		return row;
	}

	byIds(ids: readonly number[], tx?: Tx): WorkTypeDto[] {
		if (ids.length === 0) return [];
		return this.db(tx)
			.select(COLUMNS)
			.from(workTypes)
			.leftJoin(productVariants, eq(productVariants.id, workTypes.variantId))
			.leftJoin(products, eq(products.id, productVariants.productId))
			.leftJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(inArray(workTypes.id, [...ids]))
			.all();
	}

	titleTaken(title: string, exceptId: number | null, tx?: Tx): boolean {
		const [row] = this.db(tx)
			.select({ id: workTypes.id })
			.from(workTypes)
			.where(
				and(eq(workTypes.title, title), exceptId === null ? undefined : ne(workTypes.id, exceptId))
			)
			.all();
		return row !== undefined;
	}

	/** Descriptive projection only: choosing a payroll position never selects product prices. */
	variantChoices(): { id: number; label: string }[] {
		return this.db()
			.select({ id: POSITION_ID, label: VARIANT_LABEL })
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(and(isNull(productVariants.deletedAt), isNull(products.deletedAt)))
			.groupBy(productVariants.productId, productVariants.materialId)
			.orderBy(asc(products.title), asc(products.sku), asc(productVariants.materialId))
			.all()
			.map((row) => ({ id: row.id, label: row.label ?? '' }));
	}

	/** Stable representative includes archived sizes; adding a size never changes the rate. */
	canonicalVariantId(id: number, tx?: Tx): number {
		return (
			this.db(tx)
				.select({ id: POSITION_ID })
				.from(productVariants)
				.where(eq(productVariants.id, id))
				.get()?.id ?? id
		);
	}

	variantExists(id: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: productVariants.id })
				.from(productVariants)
				.innerJoin(products, eq(products.id, productVariants.productId))
				.where(
					and(
						eq(POSITION_ID, this.canonicalVariantId(id, tx)),
						isNull(productVariants.deletedAt),
						isNull(products.deletedAt)
					)
				)
				.get() !== undefined
		);
	}

	variantRoleTaken(
		variantId: number,
		roleCode: WorkRole,
		exceptId: number | null,
		tx?: Tx
	): boolean {
		return (
			this.db(tx)
				.select({ id: workTypes.id })
				.from(workTypes)
				.where(
					and(
						eq(workTypes.variantId, variantId),
						eq(workTypes.roleCode, roleCode),
						exceptId === null ? undefined : ne(workTypes.id, exceptId)
					)
				)
				.get() !== undefined
		);
	}

	insert(
		input: {
			title: string;
			rateMinor: number;
			roleCode: WorkRole | null;
			variantId?: number | null;
		},
		tx?: Tx
	): number {
		const [created] = this.db(tx)
			.insert(workTypes)
			.values(input)
			.returning({ id: workTypes.id })
			.all();
		if (!created) throw new Error('failed to insert a work type');
		return created.id;
	}

	update(
		id: number,
		patch: {
			title?: string;
			rateMinor?: number;
			roleCode?: WorkRole | null;
			variantId?: number | null;
			isActive?: boolean;
		},
		tx?: Tx
	): void {
		this.db(tx).update(workTypes).set(patch).where(eq(workTypes.id, id)).run();
	}
}
