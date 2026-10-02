import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import {
	bomNorms,
	bomVersions,
	dictItems,
	productVariants,
	products,
	stockItems
} from '../db/schema';
import type { BomLookup } from '$lib/domain/stock/bom-import';
import type { Norm } from '$lib/domain/stock/requirement';
import type { BomChoicesDto } from '$lib/types/crm-bom';
import type { ListQuery } from '$lib/types/list';

export interface BomNormRow {
	readonly id: number;
	readonly bomVersionId: number;
	readonly variantId: number;
	readonly variantSku: string;
	readonly productTitle: string;
	readonly componentId: number;
	readonly componentCode: string;
	readonly componentTitle: string;
	readonly unitTitle: string;
	readonly qtyPerUnitMilli: number;
}

export interface NewBomNorm {
	readonly variantId: number;
	readonly componentId: number;
	readonly qtyPerUnitMilli: number;
}

const COLUMNS = {
	id: bomNorms.id,
	bomVersionId: bomNorms.bomVersionId,
	variantId: bomNorms.variantId,
	variantSku: productVariants.sku,
	productTitle: products.title,
	componentId: bomNorms.componentId,
	componentCode: stockItems.code,
	componentTitle: stockItems.title,
	unitTitle: dictItems.title,
	qtyPerUnitMilli: bomNorms.qtyPerUnitMilli
};

/** SQLite binds at most 32766 values in one statement; a norm takes four. */
const INSERT_CHUNK = 500;

/** Norms of a version (C9) and what a norm is checked against: live variants and components. */
export class BomNormRepository extends BaseRepository<typeof bomNorms> {
	constructor() {
		super(bomNorms);
	}

	/** By article, then by component code: the table reads like the file it came from. */
	list(versionId: number, query: ListQuery): { rows: BomNormRow[]; total: number } {
		const where = and(
			eq(bomNorms.bomVersionId, versionId),
			query.search === undefined
				? undefined
				: or(
						containsText(productVariants.sku, query.search),
						containsText(products.title, query.search),
						containsText(stockItems.code, query.search),
						containsText(stockItems.title, query.search)
					)
		);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(bomNorms)
			.innerJoin(productVariants, eq(productVariants.id, bomNorms.variantId))
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(stockItems, eq(stockItems.id, bomNorms.componentId))
			.where(where)
			.all();
		const rows = this.select()
			.where(where)
			.orderBy(asc(productVariants.sku), asc(stockItems.code), asc(bomNorms.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	find(id: number, tx?: Tx): BomNormRow | undefined {
		const [row] = this.select(tx).where(eq(bomNorms.id, id)).all();
		return row;
	}

	/** Norms of the active version, bare: what the need of the queue is counted from. */
	activeNorms(tx?: Tx): Norm[] {
		return this.db(tx)
			.select({
				variantId: bomNorms.variantId,
				componentId: bomNorms.componentId,
				qtyPerUnitMilli: bomNorms.qtyPerUnitMilli
			})
			.from(bomNorms)
			.innerJoin(bomVersions, eq(bomVersions.id, bomNorms.bomVersionId))
			.where(eq(bomVersions.isActive, true))
			.all();
	}

	pairTaken(versionId: number, norm: NewBomNorm, tx: Tx): boolean {
		const [row] = this.db(tx)
			.select({ id: bomNorms.id })
			.from(bomNorms)
			.where(
				and(
					eq(bomNorms.bomVersionId, versionId),
					eq(bomNorms.variantId, norm.variantId),
					eq(bomNorms.componentId, norm.componentId)
				)
			)
			.all();
		return row !== undefined;
	}

	insert(versionId: number, norm: NewBomNorm, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(bomNorms)
			.values({ ...norm, bomVersionId: versionId })
			.returning({ id: bomNorms.id })
			.all();
		if (!row) throw new Error('failed to insert a norm');
		return row.id;
	}

	insertMany(versionId: number, norms: readonly NewBomNorm[], tx: Tx): void {
		for (let from = 0; from < norms.length; from += INSERT_CHUNK) {
			const chunk = norms.slice(from, from + INSERT_CHUNK);
			this.db(tx)
				.insert(bomNorms)
				.values(chunk.map((norm) => ({ ...norm, bomVersionId: versionId })))
				.run();
		}
	}

	setQty(id: number, qtyPerUnitMilli: number, tx: Tx): void {
		this.db(tx).update(bomNorms).set({ qtyPerUnitMilli }).where(eq(bomNorms.id, id)).run();
	}

	remove(id: number, tx: Tx): void {
		this.db(tx).delete(bomNorms).where(eq(bomNorms.id, id)).run();
	}

	/** Live variants and active components: what the norm form offers. */
	choices(): BomChoicesDto {
		return {
			variants: this.liveVariants(),
			components: this.db()
				.select({
					id: stockItems.id,
					code: stockItems.code,
					title: stockItems.title,
					unitTitle: dictItems.title
				})
				.from(stockItems)
				.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
				.where(and(eq(stockItems.kind, 'component'), eq(stockItems.isActive, true)))
				.orderBy(asc(stockItems.title), asc(stockItems.id))
				.all()
		};
	}

	/** Articles and codes a file is checked against (tech.md v1.46). */
	lookup(tx?: Tx): BomLookup {
		const items = this.db(tx)
			.select({ id: stockItems.id, code: stockItems.code, kind: stockItems.kind })
			.from(stockItems)
			.all();
		return {
			variants: new Map(this.liveVariants(tx).map((row) => [row.sku, row.id])),
			stockItems: new Map(items.map((row) => [row.code, { id: row.id, kind: row.kind }]))
		};
	}

	isLiveVariant(id: number, tx: Tx): boolean {
		return this.liveVariants(tx).some((row) => row.id === id);
	}

	isComponent(id: number, tx: Tx): boolean {
		const [row] = this.db(tx)
			.select({ id: stockItems.id })
			.from(stockItems)
			.where(and(eq(stockItems.id, id), eq(stockItems.kind, 'component')))
			.all();
		return row !== undefined;
	}

	private liveVariants(tx?: Tx): { id: number; sku: string; productTitle: string }[] {
		return this.db(tx)
			.select({ id: productVariants.id, sku: productVariants.sku, productTitle: products.title })
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.where(and(isNull(productVariants.deletedAt), isNull(products.deletedAt)))
			.orderBy(asc(products.title), asc(productVariants.sku))
			.all();
	}

	private select(tx?: Tx) {
		return this.db(tx)
			.select(COLUMNS)
			.from(bomNorms)
			.innerJoin(productVariants, eq(productVariants.id, bomNorms.variantId))
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(stockItems, eq(stockItems.id, bomNorms.componentId))
			.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
			.$dynamic();
	}
}
