import { eq } from 'drizzle-orm';
import fc from 'fast-check';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/lib/server/core/errors';
import { jobQueue } from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import { backoffSeconds } from '../../src/lib/server/queue/backoff';
import { defineHandler } from '../../src/lib/server/queue/job-handler';
import { Queue } from '../../src/lib/server/queue/queue';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const mail = new FakeMailDriver();
let clock = new Date('2026-09-15T10:00:00Z');

// A dispatch handler written for the test: one message per notification id, sent through the fake.
const dispatch = defineHandler({
	topic: 'notification.dispatch',
	schema: JOB_PAYLOAD_SCHEMAS['notification.dispatch'],
	async handle(payload) {
		await mail.send({
			to: 'agent@ritual.example',
			subject: `n${payload.notificationId}`,
			text: 'x'
		});
	}
});

function worker(timeoutMs = 1000): Worker {
	return new Worker({ handlers: [dispatch], clock: () => clock, timeoutMs });
}

function jobs() {
	return db.select().from(jobQueue).all();
}

function advance(seconds: number): void {
	clock = new Date(clock.getTime() + seconds * 1000);
}

beforeAll(() => {
	expect(jobs()).toHaveLength(0);
});

beforeEach(() => {
	db.delete(jobQueue).run();
	mail.reset();
	clock = new Date('2026-09-15T10:00:00Z');
});

describe('enqueue', () => {
	it('keeps one row when the same topic and key are queued twice', () => {
		expect(Queue.enqueue('notification.dispatch', { notificationId: 1 }, 'notification:1')).toBe(
			true
		);
		expect(Queue.enqueue('notification.dispatch', { notificationId: 1 }, 'notification:1')).toBe(
			false
		);

		expect(jobs()).toHaveLength(1);
	});

	it('refuses a payload that breaks the topic schema and writes nothing', () => {
		const bad = { notificationId: -1 } as unknown as { notificationId: number };

		expect(() => Queue.enqueue('notification.dispatch', bad, 'notification:x')).toThrow(
			ValidationError
		);
		expect(jobs()).toHaveLength(0);
	});

	it('rolls the job back together with the transaction that queued it', () => {
		expect(() =>
			db.transaction((tx) => {
				Queue.enqueue('notification.dispatch', { notificationId: 2 }, 'notification:2', tx);
				throw new Error('business change failed');
			})
		).toThrow('business change failed');

		expect(jobs()).toHaveLength(0);
	});
});

describe('worker', () => {
	it('runs a job queued twice exactly once', async () => {
		Queue.enqueue(
			'notification.dispatch',
			{ notificationId: 3 },
			'notification:3',
			undefined,
			clock
		);
		Queue.enqueue(
			'notification.dispatch',
			{ notificationId: 3 },
			'notification:3',
			undefined,
			clock
		);

		const w = worker();
		expect(await w.drain()).toBe(1);
		expect(await w.drain()).toBe(0);

		expect(mail.sent).toHaveLength(1);
		expect(jobs()[0]).toMatchObject({ status: 'done', attempts: 1, lockedBy: null });
	});

	it('does not claim a topic it has no handler for', async () => {
		Queue.enqueue('session.cleanup', {}, 'cleanup:20260915', undefined, clock);

		expect(await worker().drain()).toBe(0);
		expect(jobs()[0]?.status).toBe('pending');
	});

	it('retries a failure after 2^attempts seconds and sends once in the end', async () => {
		Queue.enqueue(
			'notification.dispatch',
			{ notificationId: 4 },
			'notification:4',
			undefined,
			clock
		);
		const w = worker();
		mail.failOnce();

		await w.drain();
		const [failed] = jobs();
		expect(failed).toMatchObject({ status: 'pending', attempts: 1 });
		expect(failed?.lastError).toContain('fake mail driver failure');
		expect(mail.sent).toHaveLength(0);

		advance(1);
		expect(await w.drain()).toBe(0);

		advance(2);
		expect(await w.drain()).toBe(1);
		expect(mail.sent).toHaveLength(1);
		expect(jobs()[0]).toMatchObject({ status: 'done', attempts: 2 });
	});

	it('treats a hanging driver as a failed attempt', async () => {
		Queue.enqueue(
			'notification.dispatch',
			{ notificationId: 5 },
			'notification:5',
			undefined,
			clock
		);
		mail.hangOnce();

		await worker(20).drain();

		expect(jobs()[0]).toMatchObject({ status: 'pending', attempts: 1 });
		expect(jobs()[0]?.lastError).toContain('exceeded');
		expect(mail.sent).toHaveLength(0);
	});

	it('moves a job to dead after maxAttempts and keeps no partial effect', async () => {
		Queue.enqueue(
			'notification.dispatch',
			{ notificationId: 6 },
			'notification:6',
			undefined,
			clock
		);
		const w = worker();

		for (let attempt = 1; attempt <= 5; attempt += 1) {
			mail.failOnce();
			expect(await w.drain()).toBe(1);
			advance(backoffSeconds(attempt));
		}

		expect(jobs()[0]).toMatchObject({ status: 'dead', attempts: 5 });
		expect(mail.sent).toHaveLength(0);
	});

	it('sends a payload that fails the handler schema straight to dead', async () => {
		db.insert(jobQueue)
			.values({
				topic: 'notification.dispatch',
				payload: { notificationId: 'seven' },
				idempotencyKey: 'notification:bad',
				visibleAt: clock
			})
			.run();

		await worker().drain();

		expect(jobs()[0]).toMatchObject({ status: 'dead', attempts: 1 });
	});

	it('picks up a job a crashed process left running, once its lease is over', async () => {
		Queue.enqueue(
			'notification.dispatch',
			{ notificationId: 7 },
			'notification:7',
			undefined,
			clock
		);
		const [job] = jobs();
		db.update(jobQueue)
			.set({
				status: 'running',
				lockedBy: 'worker-dead',
				lockedAt: new Date(clock.getTime() - 3_600_000)
			})
			.where(eq(jobQueue.id, job?.id ?? 0))
			.run();

		const restarted = worker();
		expect(restarted.recoverStale()).toBe(1);
		await restarted.drain();

		expect(mail.sent).toHaveLength(1);
		expect(jobs()[0]?.status).toBe('done');
	});
});

describe('backoff', () => {
	it('doubles with every attempt and never waits less than two seconds', () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 20 }), (attempts) => {
				expect(backoffSeconds(attempts)).toBeGreaterThanOrEqual(2);
				expect(backoffSeconds(attempts + 1)).toBe(backoffSeconds(attempts) * 2);
			})
		);
	});
});
