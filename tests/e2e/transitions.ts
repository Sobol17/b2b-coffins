import { execFileSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../../src/lib/server/db/client';
import {
	paymentMarks,
	requestAssignees,
	requestStatusHistory,
	requests,
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

/** Assignment is a C4 screen and payment marks are C7, so the helper writes them as fixtures. */
export function assignCrew(db: Db, number: string, actor: RoleKey, role: 'carpenter' | 'driver') {
	db.insert(requestAssignees)
		.values({ requestId: requestId(db, number), userId: userId(db, actor), role })
		.onConflictDoNothing()
		.run();
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
