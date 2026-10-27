import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { createDb, type Db } from '../../src/lib/server/db/client';
import {
	options,
	paymentMarks,
	productVariants,
	requestItemOptions,
	requestItems,
	requestStatusHistory,
	requests,
	stockMoves,
	users
} from '../../src/lib/server/db/schema';
import { ACCOUNTS, type RoleKey } from './fixtures';
import type { RequestStatus } from '../../src/lib/types/request';
import { E2E_DATABASE_PATH } from './transition-cli';

export { transition, type TransitionResult } from './transition-cli';

export function e2eDb(): Db {
	return createDb(E2E_DATABASE_PATH);
}

interface Position {
	readonly stockItemId: number;
	readonly optionId: number | null;
}

/**
 * Stocks the positions of the request so the whole demand on them is covered (tech.md v1.41). The
 * e2e database keeps requests in work from earlier runs, and the fill may serve them first, so
 * making only the pieces of this request would not be enough. `leave` pieces stay unmade: a spec
 * marks them on the shop screen itself.
 */
export function stockUp(db: Db, number: string, leave = 0): void {
	const lines = linesOf(db, [requestId(db, number)]);
	for (const line of lines) {
		const lacking = demandOn(db, line) - balanceOf(db, line) - leave;
		if (lacking <= 0) continue;
		db.insert(stockMoves)
			.values({ ...line, qty: lacking, type: 'production', occurredAt: new Date() })
			.run();
	}
}

function linesOf(
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

/** Pieces every request that holds or wants stock asks of the position. */
function demandOn(db: Db, position: Position): number {
	const ids = db
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

/**
 * Loads every line of the request for delivery (tech.md v1.43): a shipment move per line, carrying
 * it, so guard `fullyLoaded` lets the delivery through the CLI.
 */
export function loadUp(db: Db, number: string): void {
	const id = requestId(db, number);
	for (const line of linesOf(db, [id])) {
		db.insert(stockMoves)
			.values({
				stockItemId: line.stockItemId,
				optionId: line.optionId,
				qty: -line.qty,
				type: 'shipment',
				requestId: id,
				requestItemId: line.itemId,
				occurredAt: new Date()
			})
			.run();
	}
}

export function markPaidInFull(db: Db, number: string, actor: RoleKey): void {
	const id = requestId(db, number);
	const [row] = db
		.select({ total: requests.totalMinor })
		.from(requests)
		.where(eq(requests.id, id))
		.all();
	db.insert(paymentMarks)
		.values({
			requestId: id,
			amountMinor: row?.total ?? 0,
			paidAt: new Date(),
			method: 'bank',
			createdById: userId(db, actor)
		})
		.run();
}

/** The total of a request and the signed sum of its payment marks, straight from the database. */
export function moneyOf(db: Db, number: string): { totalMinor: number; marksMinor: number } {
	const id = requestId(db, number);
	const [row] = db
		.select({ total: requests.totalMinor })
		.from(requests)
		.where(eq(requests.id, id))
		.all();
	const marks = db
		.select({ amount: paymentMarks.amountMinor })
		.from(paymentMarks)
		.where(eq(paymentMarks.requestId, id))
		.all();
	return {
		totalMinor: row?.total ?? 0,
		marksMinor: marks.reduce((sum, mark) => sum + mark.amount, 0)
	};
}

export function statusChain(db: Db, number: string): string[] {
	return db
		.select({ from: requestStatusHistory.fromStatus, to: requestStatusHistory.toStatus })
		.from(requestStatusHistory)
		.where(eq(requestStatusHistory.requestId, requestId(db, number)))
		.orderBy(requestStatusHistory.id)
		.all()
		.map((row) => `${row.from}->${row.to}`);
}

export function statusOf(db: Db, number: string): RequestStatus | undefined {
	return db.select().from(requests).where(eq(requests.number, number)).all()[0]?.status;
}

function requestId(db: Db, number: string): number {
	const [row] = db
		.select({ id: requests.id })
		.from(requests)
		.where(eq(requests.number, number))
		.all();
	if (!row) throw new Error(`request ${number} not found`);
	return row.id;
}

function userId(db: Db, actor: RoleKey): number {
	const [row] = db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, ACCOUNTS[actor].email))
		.all();
	if (!row) throw new Error(`user ${ACCOUNTS[actor].email} not found`);
	return row.id;
}
