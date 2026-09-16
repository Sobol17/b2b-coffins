import { and, eq } from 'drizzle-orm';
import { database } from '../../../src/lib/server/db/client';
import {
	dictItems,
	jobQueue,
	paymentMarks,
	requestAssignees,
	requestStatusHistory,
	requests
} from '../../../src/lib/server/db/schema';
import { httpStatusFor } from '../../../src/lib/server/core/errors';
import { RequestTransitionService } from '../../../src/lib/server/request/request-transition.service';
import type { ActorContext } from '../../../src/lib/types/actor';
import type { DictCode } from '../../../src/lib/types/dicts';
import type { RequestStatus, SubmittedRequestDto } from '../../../src/lib/types/request';

export interface MoveNote {
	readonly reasonId: number | null;
	readonly comment: string | null;
}

export function move(
	ctx: ActorContext,
	id: number,
	to: RequestStatus,
	note: Partial<MoveNote> = {}
): SubmittedRequestDto {
	return new RequestTransitionService(ctx).move(id, {
		to,
		reasonId: note.reasonId ?? null,
		comment: note.comment ?? null
	});
}

/** The error class and the HTTP status of a refused move, taken from a single call. */
export function refused(run: () => unknown): { name: string; status: number } {
	try {
		run();
	} catch (err) {
		return {
			name: err instanceof Error ? err.constructor.name : 'unknown',
			status: httpStatusFor(err)
		};
	}
	return { name: 'no refusal', status: 200 };
}

/** Assignment is a C4 screen and payment marks are C7, so a P5 test writes them as fixtures. */
export function assign(requestId: number, userId: number, role: 'carpenter' | 'driver'): void {
	database.insert(requestAssignees).values({ requestId, userId, role }).run();
}

export function pay(requestId: number, amountMinor: number, createdById: number): void {
	database
		.insert(paymentMarks)
		.values({ requestId, amountMinor, paidAt: new Date(), method: 'bank', createdById })
		.run();
}

export function totalOf(requestId: number): number {
	return (
		database
			.select({ total: requests.totalMinor })
			.from(requests)
			.where(eq(requests.id, requestId))
			.all()[0]?.total ?? 0
	);
}

export function statusOf(requestId: number): RequestStatus | undefined {
	return database
		.select({ status: requests.status })
		.from(requests)
		.where(eq(requests.id, requestId))
		.all()[0]?.status;
}

export function history(requestId: number) {
	return database
		.select()
		.from(requestStatusHistory)
		.where(eq(requestStatusHistory.requestId, requestId))
		.orderBy(requestStatusHistory.id)
		.all();
}

export function fanouts(eventKey: string) {
	return database
		.select({ key: jobQueue.idempotencyKey, payload: jobQueue.payload })
		.from(jobQueue)
		.where(eq(jobQueue.topic, 'notification.fanout'))
		.all()
		.filter((job) => job.key.startsWith(`fanout:${eventKey}:`));
}

export function dictId(dict: DictCode, code: string): number {
	return (
		database
			.select({ id: dictItems.id })
			.from(dictItems)
			.where(and(eq(dictItems.dict, dict), eq(dictItems.code, code)))
			.all()[0]?.id ?? 0
	);
}
