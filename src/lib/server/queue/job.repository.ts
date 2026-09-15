import { and, asc, eq, inArray, lt, lte } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { jobQueue } from '../db/schema';
import type { JobTopic } from '$lib/types/dicts';

export type JobRow = typeof jobQueue.$inferSelect;
export type JobStatus = JobRow['status'];

export interface NewJob {
	readonly topic: JobTopic;
	readonly payload: Record<string, unknown>;
	readonly idempotencyKey: string;
	readonly visibleAt: Date;
}

const RELEASED = { lockedAt: null, lockedBy: null } as const;

export class JobRepository extends BaseRepository<typeof jobQueue> {
	constructor() {
		super(jobQueue);
	}

	/** False when the topic and key are already queued: the unique index decides, not a read. */
	insertIgnore(job: NewJob, tx?: Tx): boolean {
		const result = this.db(tx)
			.insert(jobQueue)
			.values(job)
			.onConflictDoNothing({ target: [jobQueue.topic, jobQueue.idempotencyKey] })
			.run();
		return result.changes > 0;
	}

	/** One UPDATE over a subquery: SQLite has a single writer, so two pollers cannot take one row. */
	claimNext(topics: readonly JobTopic[], workerId: string, now: Date): JobRow | undefined {
		if (topics.length === 0) return undefined;
		const due = this.db()
			.select({ id: jobQueue.id })
			.from(jobQueue)
			.where(
				and(
					eq(jobQueue.status, 'pending'),
					lte(jobQueue.visibleAt, now),
					inArray(jobQueue.topic, [...topics])
				)
			)
			.orderBy(asc(jobQueue.visibleAt), asc(jobQueue.id))
			.limit(1);
		const [row] = this.db()
			.update(jobQueue)
			.set({ status: 'running', lockedAt: now, lockedBy: workerId })
			.where(and(inArray(jobQueue.id, due), eq(jobQueue.status, 'pending')))
			.returning()
			.all();
		return row;
	}

	markDone(id: number, attempts: number, at: Date): void {
		this.db()
			.update(jobQueue)
			.set({ status: 'done', attempts, finishedAt: at, lastError: null, ...RELEASED })
			.where(eq(jobQueue.id, id))
			.run();
	}

	reschedule(id: number, attempts: number, visibleAt: Date, error: string): void {
		this.db()
			.update(jobQueue)
			.set({ status: 'pending', attempts, visibleAt, lastError: error, ...RELEASED })
			.where(eq(jobQueue.id, id))
			.run();
	}

	markDead(id: number, attempts: number, error: string, at: Date): void {
		this.db()
			.update(jobQueue)
			.set({ status: 'dead', attempts, finishedAt: at, lastError: error, ...RELEASED })
			.where(eq(jobQueue.id, id))
			.run();
	}

	/** Jobs a crashed process left in `running`. The attempt counter stays as it was. */
	releaseStale(lockedBefore: Date): number {
		return this.db()
			.update(jobQueue)
			.set({ status: 'pending', ...RELEASED })
			.where(and(eq(jobQueue.status, 'running'), lt(jobQueue.lockedAt, lockedBefore)))
			.run().changes;
	}

	countByStatus(): Record<JobStatus, number> {
		const counts: Record<JobStatus, number> = {
			pending: 0,
			running: 0,
			done: 0,
			failed: 0,
			dead: 0
		};
		const rows = this.db()
			.select({ status: jobQueue.status, count: countExpression })
			.from(jobQueue)
			.groupBy(jobQueue.status)
			.all();
		for (const row of rows) counts[row.status] = row.count;
		return counts;
	}
}
