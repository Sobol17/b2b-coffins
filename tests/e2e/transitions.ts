import { execFileSync } from 'node:child_process';
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

const DATABASE_PATH = './data/e2e.db';

export function e2eDb(): Db {
	return createDb(DATABASE_PATH);
}

export interface TransitionResult {
	readonly ok: boolean;
	readonly output: string;
}

/**
 * Moves a request the way an operator does it until the CRM screens arrive in C4 to C7: through
 * `pnpm admin`, against the e2e database, with the rights of a real account.
 */
export function transition(
	number: string,
	to: RequestStatus,
	actor: RoleKey,
	note: { reason?: string; comment?: string } = {}
): TransitionResult {
	const argv = [
		'admin',
		'request:transition',
		'--request',
		number,
		'--to',
		to,
		'--actor',
		ACCOUNTS[actor].email,
		...(note.reason ? ['--reason', note.reason] : []),
		...(note.comment ? ['--comment', note.comment] : [])
	];
	try {
		const output = execFileSync('pnpm', argv, {
			encoding: 'utf8',
			stdio: 'pipe',
			env: { ...process.env, DATABASE_PATH }
		});
		return { ok: true, output };
	} catch (err) {
		const failed = err as { stdout?: string; stderr?: string };
		return { ok: false, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
	}
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

function linesOf(db: Db, requestIds: readonly number[]): (Position & { qty: number })[] {
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
		return { stockItemId: row.stockItemId ?? 0, optionId: colour?.optionId ?? null, qty: row.qty };
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
