import { and, asc, eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { bomNorms, bomVersions, stockMoves } from '../db/schema';
import { consume } from '$lib/domain/stock/consumption';

export interface ConsumedComponent {
	readonly componentId: number;
	/** Signed quantity of the move, zero or below. */
	readonly qty: number;
	readonly consumedMilli: number;
}

export interface ConsumptionOutcome {
	/** Null when no active version holds a norm of the variant. */
	readonly bomVersionId: number | null;
	readonly consumed: readonly ConsumedComponent[];
}

export interface ProductionMark {
	readonly variantId: number;
	readonly pieces: number;
	readonly actorId: number;
	readonly occurredAt: Date;
}

/**
 * Components a production mark uses (C9, tech.md v1.46): one `consumption` move per norm of the
 * variant in the active version. A move is written even when it takes no whole unit off the
 * shelf, because its exact figure is what carries the fraction to the next mark.
 */
export class ComponentConsumption extends BaseRepository<typeof stockMoves> {
	constructor() {
		super(stockMoves);
	}

	/** Call inside the transaction of the production mark: a failed write rolls the mark back. */
	write(mark: ProductionMark, tx: Tx): ConsumptionOutcome {
		const norms = this.activeNorms(mark.variantId, tx);
		const consumed = norms.map((norm): ConsumedComponent => {
			const { qty, consumedMilli } = consume(
				this.carry(norm.componentId, tx),
				mark.pieces,
				norm.qtyPerUnitMilli
			);
			this.db(tx)
				.insert(stockMoves)
				.values({
					stockItemId: norm.componentId,
					optionId: null,
					qty,
					consumedMilli,
					type: 'consumption',
					actorId: mark.actorId,
					occurredAt: mark.occurredAt
				})
				.run();
			return { componentId: norm.componentId, qty, consumedMilli };
		});
		return { bomVersionId: norms[0]?.bomVersionId ?? null, consumed };
	}

	private activeNorms(variantId: number, tx: Tx) {
		return this.db(tx)
			.select({
				bomVersionId: bomNorms.bomVersionId,
				componentId: bomNorms.componentId,
				qtyPerUnitMilli: bomNorms.qtyPerUnitMilli
			})
			.from(bomNorms)
			.innerJoin(bomVersions, eq(bomVersions.id, bomNorms.bomVersionId))
			.where(and(eq(bomNorms.variantId, variantId), eq(bomVersions.isActive, true)))
			.orderBy(asc(bomNorms.id))
			.all();
	}

	/** The fraction used but not yet written off: `carryOf` of the domain, folded by SQLite. */
	private carry(componentId: number, tx: Tx): number {
		const [row] = this.db(tx)
			.select({
				carry: sql<number>`coalesce(sum(coalesce(${stockMoves.consumedMilli}, 0) + ${stockMoves.qty} * 1000), 0)`
			})
			.from(stockMoves)
			.where(and(eq(stockMoves.stockItemId, componentId), eq(stockMoves.type, 'consumption')))
			.all();
		return row?.carry ?? 0;
	}
}
