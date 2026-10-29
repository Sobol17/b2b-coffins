import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import {
	options,
	productVariants,
	requestItemOptions,
	requestItems,
	requests,
	stockMoves
} from '../../src/lib/server/db/schema';
import type { RequestStatus } from '../../src/lib/types/request';
import { transition } from './transition-cli';

/** Comment of the moves the helpers write by hand; the global setup removes them before a run. */
export const SHELF_MARK = 'e2e: shelf';

interface Position {
	readonly stockItemId: number;
	readonly optionId: number | null;
}

/**
 * Stocks the positions of the request so the whole demand on them is covered (tech.md §20.4). The
 * e2e database keeps requests in work from earlier runs, and the fill may serve them first, so
 * stocking only the pieces of this request would not be enough. The request itself counts even
 * before acceptance, so the move into work readies it at once.
 */
export function stockUp(db: Db, number: string): void {
	const id = requestId(db, number);
	const lines = linesOf(db, [id]);
	for (const line of lines) {
		const lacking = demandOn(db, line, id) - balanceOf(db, line);
		if (lacking <= 0) continue;
		db.insert(stockMoves)
			.values({
				stockItemId: line.stockItemId,
				optionId: line.optionId,
				qty: lacking,
				type: 'purchase',
				comment: SHELF_MARK,
				occurredAt: new Date()
			})
			.run();
	}
}

/**
 * Levels the shelf so the fill hands the request nothing and all of its pieces go to the stations
 * (tech.md §20.4). Pieces other requests in work or ready wait for stay on the shelf. A shelf below
 * zero, owed to old loadings, is raised too: a made piece must land on the request, not on the debt.
 */
export function emptyShelf(db: Db, number: string): void {
	const id = requestId(db, number);
	for (const line of linesOf(db, [id])) {
		// Below zero the shelf goes up to zero; above what the others want, down to that.
		const balance = balanceOf(db, line);
		const level = Math.min(Math.max(balance, 0), demandOn(db, line, null));
		const free = balance - level;
		if (free === 0) continue;
		db.insert(stockMoves)
			.values({
				stockItemId: line.stockItemId,
				optionId: line.optionId,
				qty: -free,
				type: 'adjustment',
				comment: SHELF_MARK,
				occurredAt: new Date()
			})
			.run();
	}
}

/** Puts `qty` pieces of every position of the request on the shelf, past what is there. */
export function addToShelf(db: Db, number: string, qty: number): void {
	for (const line of linesOf(db, [requestId(db, number)])) {
		db.insert(stockMoves)
			.values({
				stockItemId: line.stockItemId,
				optionId: line.optionId,
				qty,
				type: 'purchase',
				comment: SHELF_MARK,
				occurredAt: new Date()
			})
			.run();
	}
}

/**
 * Accepts a sent request whose pieces wait on the shelf: the system readies it in the same move
 * (tech.md §6.2), so specs about delivery and money start from `ready` without the stations.
 */
export function acceptReady(db: Db, number: string): void {
	stockUp(db, number);
	const accepted = transition(number, 'in_work', 'manager');
	if (!accepted.ok) throw new Error(`request ${number} was not accepted`);
	const status = statusOf(db, number);
	if (status !== 'ready') throw new Error(`request ${number} stayed in ${status}`);
}

export function linesOf(
	db: Db,
	requestIds: readonly number[]
): (Position & { itemId: number; qty: number })[] {
	if (requestIds.length === 0) return [];
	const rows = db
		.select({
			itemId: requestItems.id,
			qty: requestItems.qty,
			stockItemId: productVariants.stockItemId
		})
		.from(requestItems)
		.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
		.where(inArray(requestItems.requestId, [...requestIds]))
		.all();
	return rows.map((row) => {
		const [colour] = db
			.select({ optionId: options.id })
			.from(requestItemOptions)
			.innerJoin(options, eq(options.id, requestItemOptions.optionId))
			.where(and(eq(requestItemOptions.itemId, row.itemId), eq(options.kind, 'color')))
			.all();
		return {
			itemId: row.itemId,
			stockItemId: row.stockItemId ?? 0,
			optionId: colour?.optionId ?? null,
			qty: row.qty
		};
	});
}

/** Pieces every request that holds or wants stock asks of the position, plus `own`. */
function demandOn(db: Db, position: Position, own: number | null): number {
	const held = db
		.select({ id: requests.id })
		.from(requests)
		.where(
			or(
				eq(requests.status, 'in_work'),
				and(eq(requests.status, 'ready'), eq(requests.isStockRequest, false))
			)
		)
		.all()
		.map((row) => row.id);
	const ids = own === null ? held : [...new Set([...held, own])];
	return linesOf(db, ids)
		.filter(
			(line) => line.stockItemId === position.stockItemId && line.optionId === position.optionId
		)
		.reduce((sum, line) => sum + line.qty, 0);
}

function balanceOf(db: Db, position: Position): number {
	const [row] = db
		.select({ qty: sql<number>`coalesce(sum(${stockMoves.qty}), 0)` })
		.from(stockMoves)
		.where(
			and(
				eq(stockMoves.stockItemId, position.stockItemId),
				position.optionId === null
					? isNull(stockMoves.optionId)
					: eq(stockMoves.optionId, position.optionId)
			)
		)
		.all();
	return row?.qty ?? 0;
}

export function statusOf(db: Db, number: string): RequestStatus | undefined {
	return db.select().from(requests).where(eq(requests.number, number)).all()[0]?.status;
}

export function requestId(db: Db, number: string): number {
	const [row] = db
		.select({ id: requests.id })
		.from(requests)
		.where(eq(requests.number, number))
		.all();
	if (!row) throw new Error(`request ${number} not found`);
	return row.id;
}
