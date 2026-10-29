import { and, eq, inArray } from 'drizzle-orm';
import { createDb, type Db } from '../../src/lib/server/db/client';
import {
	paymentMarks,
	requestStatusHistory,
	requests,
	stockMoves,
	users
} from '../../src/lib/server/db/schema';
import { ACCOUNTS, type RoleKey } from './fixtures';
import { linesOf, requestId } from './shelf';
import { E2E_DATABASE_PATH } from './transition-cli';

export { acceptReady, addToShelf, emptyShelf, SHELF_MARK, statusOf, stockUp } from './shelf';
export { shopSync, transition, type TransitionResult } from './transition-cli';

export function e2eDb(): Db {
	return createDb(E2E_DATABASE_PATH);
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

/**
 * Covers with marks every other open request of the counterparty that owns `number`. The e2e
 * database keeps the requests of earlier runs, and a request closes only when its counterparty owes
 * nothing else (tech.md v1.65). The covered ones close together with `number`.
 */
export function clearOtherDebts(db: Db, number: string): void {
	const id = requestId(db, number);
	const [own] = db
		.select({ counterpartyId: requests.counterpartyId })
		.from(requests)
		.where(eq(requests.id, id))
		.all();
	if (!own?.counterpartyId) return;
	const others = db
		.select({ id: requests.id, total: requests.totalMinor })
		.from(requests)
		.where(
			and(
				eq(requests.counterpartyId, own.counterpartyId),
				inArray(requests.status, ['delivered', 'awaiting_payment'])
			)
		)
		.all()
		.filter((row) => row.id !== id);
	for (const other of others) {
		const marks = db
			.select({ amount: paymentMarks.amountMinor })
			.from(paymentMarks)
			.where(eq(paymentMarks.requestId, other.id))
			.all()
			.reduce((sum, mark) => sum + mark.amount, 0);
		if (marks >= other.total) continue;
		db.insert(paymentMarks)
			.values({
				requestId: other.id,
				amountMinor: other.total - marks,
				paidAt: new Date(),
				method: 'bank',
				createdById: userId(db, 'manager')
			})
			.run();
		db.update(requests).set({ paidMinor: other.total }).where(eq(requests.id, other.id)).run();
	}
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

function userId(db: Db, actor: RoleKey): number {
	const [row] = db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, ACCOUNTS[actor].email))
		.all();
	if (!row) throw new Error(`user ${ACCOUNTS[actor].email} not found`);
	return row.id;
}
