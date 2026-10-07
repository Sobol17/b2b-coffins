import { and, eq, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { BaseRepository } from '../core/repository';
import { dictItems, options, stockItems, stockMoves } from '../db/schema';
import type { ReportWindow } from '$lib/domain/report/period';
import type { StockKind } from '$lib/types/crm-stock';

export interface TurnoverRow {
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly code: string;
	readonly title: string;
	readonly optionTitle: string | null;
	readonly unitTitle: string;
	readonly opening: number;
	readonly income: number;
	readonly outcome: number;
	readonly shipped: number;
	readonly movesInWindow: number;
}

/** The moves of a position folded into one row of the turnover sheet (C13). */
export class StockTurnoverRepository extends BaseRepository<typeof stockMoves> {
	constructor() {
		super(stockMoves);
	}

	rows(window: ReportWindow, kind: StockKind | null): TurnoverRow[] {
		// The reversed move tells a taken-back loading from any other reversal.
		const undone = alias(stockMoves, 'undone');
		const inWindow = sql`${stockMoves.occurredAt} >= ${sql.param(window.from, stockMoves.occurredAt)}`;
		const sumIf = (when: SQL, value: SQL) =>
			sql<number>`coalesce(sum(case when ${when} then ${value} else 0 end), 0)`;
		const shipment = sql`(${stockMoves.type} = 'shipment' or ${undone.type} = 'shipment')`;
		return this.db()
			.select({
				stockItemId: stockMoves.stockItemId,
				optionId: stockMoves.optionId,
				code: stockItems.code,
				title: stockItems.title,
				optionTitle: options.title,
				unitTitle: dictItems.title,
				opening: sumIf(sql`not ${inWindow}`, sql`${stockMoves.qty}`),
				income: sumIf(sql`${inWindow} and ${stockMoves.qty} > 0`, sql`${stockMoves.qty}`),
				outcome: sumIf(sql`${inWindow} and ${stockMoves.qty} < 0`, sql`-${stockMoves.qty}`),
				shipped: sumIf(sql`${inWindow} and ${shipment}`, sql`-${stockMoves.qty}`),
				movesInWindow: sumIf(inWindow, sql`1`)
			})
			.from(stockMoves)
			.innerJoin(stockItems, eq(stockItems.id, stockMoves.stockItemId))
			.innerJoin(dictItems, eq(dictItems.id, stockItems.unitId))
			.leftJoin(options, eq(options.id, stockMoves.optionId))
			.leftJoin(undone, eq(undone.id, stockMoves.reversalOfId))
			.where(
				and(
					lt(stockMoves.occurredAt, window.to),
					kind === null ? undefined : eq(stockItems.kind, kind)
				)
			)
			.groupBy(stockMoves.stockItemId, stockMoves.optionId)
			.orderBy(stockItems.title, options.title)
			.all();
	}
}
