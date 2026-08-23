import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { checkTransition, type ActorRole } from '../../src/lib/domain/request/state-machine';
import type { Db } from '../../src/lib/server/db/client';
import {
	dictItems,
	paymentMarks,
	requestAssignees,
	requestStatusHistory,
	requests,
	roles,
	userRoles,
	users
} from '../../src/lib/server/db/schema';
import { REQUEST_STATUSES } from '../../src/lib/types/request';
import { readOptions, STRING_OPTION } from './args';

const schema = z.object({
	request: z.string().min(1),
	to: z.enum(REQUEST_STATUSES),
	actor: z.email().optional(),
	reason: z.string().optional(),
	comment: z.string().optional()
});

const STATUS_TIMESTAMP = {
	new: 'submittedAt',
	in_work: 'acceptedAt',
	ready: 'readyAt',
	delivered: 'deliveredAt',
	paid: 'paidAt'
} as const satisfies Partial<Record<(typeof REQUEST_STATUSES)[number], string>>;

export function requestTransition(db: Db, argv: readonly string[]): void {
	const input = readOptions(
		argv,
		{
			request: STRING_OPTION,
			to: STRING_OPTION,
			actor: STRING_OPTION,
			reason: STRING_OPTION,
			comment: STRING_OPTION
		},
		schema
	);

	const [row] = db.select().from(requests).where(eq(requests.number, input.request)).all();
	if (!row) throw new Error(`request ${input.request} not found`);

	const actor = input.actor ? loadActor(db, input.actor) : null;
	const actorRoles: readonly ActorRole[] = actor?.roles ?? ['system'];
	const reasonId = input.reason ? dictIdByCode(db, input.reason) : null;

	const check = checkTransition({
		from: row.status,
		to: input.to,
		actorRoles,
		isOwnRequest:
			actor === null || row.counterpartyId === null || actor.counterpartyId === row.counterpartyId,
		isAssigned: actor === null || isAssigned(db, row.id, actor.id),
		hasReason: reasonId !== null,
		guards: {
			hasAssignee: hasAnyAssignee(db, row.id),
			pricesFixed: row.totalMinor > 0,
			fullyPaid: paidTotal(db, row.id) >= row.totalMinor
		}
	});
	if (!check.ok) {
		throw new Error(
			`transition ${row.status} -> ${input.to} rejected: ${JSON.stringify(check.denial)}`
		);
	}

	// Status change and history line share one transaction: invariant 2 of tech.md 6.2.
	db.transaction((tx) => {
		const stamp = STATUS_TIMESTAMP[input.to as keyof typeof STATUS_TIMESTAMP];
		tx.update(requests)
			.set({ status: input.to, ...(stamp ? { [stamp]: new Date() } : {}) })
			.where(eq(requests.id, row.id))
			.run();
		tx.insert(requestStatusHistory)
			.values({
				requestId: row.id,
				fromStatus: row.status,
				toStatus: input.to,
				actorId: actor?.id ?? null,
				reasonId,
				comment: input.comment ?? null
			})
			.run();
	});

	console.log(JSON.stringify({ request: row.number, from: row.status, to: input.to }));
}

function loadActor(
	db: Db,
	email: string
): { id: number; counterpartyId: number | null; roles: ActorRole[] } {
	const [user] = db.select().from(users).where(eq(users.email, email)).all();
	if (!user) throw new Error(`user ${email} not found`);

	const codes = db
		.select({ code: roles.code })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(eq(userRoles.userId, user.id))
		.all()
		.map((r) => r.code as ActorRole);
	return { id: user.id, counterpartyId: user.counterpartyId, roles: codes };
}

function dictIdByCode(db: Db, code: string): number {
	const [item] = db
		.select({ id: dictItems.id })
		.from(dictItems)
		.where(and(eq(dictItems.dict, 'refusal_reason'), eq(dictItems.code, code)))
		.all();
	if (!item) throw new Error(`refusal reason ${code} not found`);
	return item.id;
}

function isAssigned(db: Db, requestId: number, userId: number): boolean {
	return (
		db
			.select({ userId: requestAssignees.userId })
			.from(requestAssignees)
			.where(and(eq(requestAssignees.requestId, requestId), eq(requestAssignees.userId, userId)))
			.all().length > 0
	);
}

function hasAnyAssignee(db: Db, requestId: number): boolean {
	return (
		db
			.select({ userId: requestAssignees.userId })
			.from(requestAssignees)
			.where(eq(requestAssignees.requestId, requestId))
			.all().length > 0
	);
}

function paidTotal(db: Db, requestId: number): number {
	return db
		.select({ amountMinor: paymentMarks.amountMinor })
		.from(paymentMarks)
		.where(eq(paymentMarks.requestId, requestId))
		.all()
		.reduce((sum, mark) => sum + mark.amountMinor, 0);
}
