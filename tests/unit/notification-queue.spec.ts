import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationFeed,
	notifications,
	requests,
	userNotificationPrefs,
	users
} from '../../src/lib/server/db/schema';
import { bus } from '../../src/lib/server/events/bus';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { createNotificationDispatchHandler } from '../../src/lib/server/queue/handlers/notification-dispatch';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { Queue } from '../../src/lib/server/queue/queue';
import { JOB_PAYLOAD_SCHEMAS, jobKey } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import type { EventKey } from '../../src/lib/types/events';
import { seedCharityWorld } from './helpers/charity';
import { insertUser, migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';
import { dictId, move } from './helpers/transitions';

const db = migratedDatabase();
const { world, ids, actors, sent, drive } = seedCharityWorld(db);
const ownerId = insertUser({ email: 'own@fund.example', role: 'owner', counterpartyId: null });
seedNotificationRules(db);

let switchedOn = true;

function worker(): Worker {
	const rows = new NotificationRepository();
	return new Worker({
		handlers: [
			createNotificationFanoutHandler({
				rules: new NotificationRuleRepository(),
				notifications: rows,
				isEnabled: () => switchedOn
			}),
			createNotificationDispatchHandler({ notifications: rows })
		]
	});
}

/** Who has the event in the bell, as sorted user ids. */
function heard(eventKey: EventKey, entityId: number): number[] {
	return db
		.select()
		.from(notificationFeed)
		.all()
		.filter((row) => row.eventKey === eventKey && row.entityId === entityId)
		.map((row) => row.userId)
		.sort((a, b) => a - b);
}

const sorted = (...userIds: number[]): number[] => [...userIds].sort((a, b) => a - b);

function jobs(topic: 'notification.fanout' | 'notification.dispatch') {
	return db.select().from(jobQueue).where(eq(jobQueue.topic, topic)).all();
}

function stockRequest(): number {
	const [row] = db
		.insert(requests)
		.values({
			number: `С-${Date.now()}`,
			counterpartyId: null,
			isStockRequest: true,
			createdById: ids.manager,
			status: 'ready'
		})
		.returning()
		.all();
	return row?.id ?? 0;
}

beforeEach(() => {
	resetRequests(db);
	db.delete(notificationFeed).run();
	db.delete(notifications).run();
	db.delete(userNotificationPrefs).run();
	db.update(users).set({ isActive: true }).run();
	switchedOn = true;
});

describe('notification.fanout reaches the workshop (C12)', () => {
	it('tells the administrator of the workshop about a submitted request', async () => {
		const id = sent(actors.employee);

		await worker().drain();

		expect(heard('request.submitted', id)).toEqual([ids.manager]);
	});

	it('tells the counterparty that its request was accepted', async () => {
		const id = sent(actors.employee);
		drive(id, 'in_work');

		await worker().drain();

		expect(heard('request.accepted', id)).toEqual(sorted(world.adminId, world.employeeId));
	});

	it('tells the workshop that the counterparty cancelled', async () => {
		const id = sent(actors.admin);
		move(actors.admin, id, 'cancelled');

		await worker().drain();

		expect(heard('request.cancelled', id)).toEqual([ids.manager]);
	});

	it('tells the counterparty that the workshop rejected the request', async () => {
		const id = sent(actors.admin);
		move(actors.manager, id, 'rejected', { reasonId: dictId('refusal_reason', 'no_capacity') });

		await worker().drain();

		expect(heard('request.rejected', id)).toEqual([world.adminId]);
	});

	it('tells both contours that a request is ready, the driver included', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');

		await worker().drain();

		expect(heard('request.ready', id)).toEqual(sorted(world.adminId, ids.manager, ids.driver));
	});

	it('keeps the driver and the portal out of a stock request', async () => {
		const id = stockRequest();
		bus.emit('request.ready', id);

		await worker().drain();

		expect(heard('request.ready', id)).toEqual([ids.manager]);
	});

	it('tells the workshop alone about a low shelf', async () => {
		bus.emit('stock.below_threshold', 1);

		await worker().drain();

		expect(heard('stock.below_threshold', 1)).toEqual(sorted(ids.manager, ownerId));
	});

	it('tells the owner that the payroll week is closed', async () => {
		bus.emit('payroll.week_closed', 7);

		await worker().drain();

		expect(heard('payroll.week_closed', 7)).toEqual([ownerId]);
	});

	it('skips a disabled account', async () => {
		db.update(users).set({ isActive: false }).where(eq(users.id, ids.manager)).run();
		const id = sent(actors.admin);

		await worker().drain();

		expect(heard('request.submitted', id)).toEqual([]);
	});

	it('tells nobody when the workshop switch is off', async () => {
		switchedOn = false;
		drive(sent(actors.admin), 'ready');

		await worker().drain();

		expect(db.select().from(notificationFeed).all()).toHaveLength(0);
	});
});

describe('no channel is live before C15', () => {
	it('writes the feed and sends nothing: no channel row, no dispatch job', async () => {
		db.insert(userNotificationPrefs)
			.values({ userId: world.adminId, eventKey: 'request.ready', channel: 'push', enabled: true })
			.run();
		const id = sent(actors.admin);
		drive(id, 'ready');

		await worker().drain();

		expect(heard('request.ready', id)).toContain(world.adminId);
		expect(db.select().from(notifications).all()).toHaveLength(0);
		expect(jobs('notification.dispatch')).toHaveLength(0);
	});

	it('queues payloads that match the contract of tech.md 7.2', async () => {
		drive(sent(actors.admin), 'ready');
		await worker().drain();

		const all = jobs('notification.fanout');
		expect(all.length).toBeGreaterThan(0);
		for (const job of all) {
			expect(JOB_PAYLOAD_SCHEMAS[job.topic].safeParse(job.payload).success).toBe(true);
			expect(job.idempotencyKey).toBe(
				`fanout:${String(job.payload['eventKey'])}:${String(job.payload['entityId'])}`
			);
		}
	});
});

describe('idempotency of the notification jobs', () => {
	it('leaves one feed row per person when the fanout runs twice', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await worker().drain();
		const before = heard('request.ready', id);
		// Same payload again, as after a crash between the commit and `done`.
		db.update(jobQueue)
			.set({ status: 'pending', finishedAt: null })
			.where(eq(jobQueue.topic, 'notification.fanout'))
			.run();

		await worker().drain();

		expect(heard('request.ready', id)).toEqual(before);
		expect(before).toHaveLength(3);
	});

	it('leaves a sent row alone when its dispatch runs twice', async () => {
		const id = pushRow('sent');
		Queue.enqueue('notification.dispatch', { notificationId: id }, jobKey.dispatch(id));
		await worker().drain();
		db.update(jobQueue).set({ status: 'pending', finishedAt: null }).run();

		await worker().drain();

		expect(rowOf(id)).toMatchObject({ status: 'sent', attempts: 1, error: null });
		expect(jobs('notification.dispatch')[0]?.status).toBe('done');
	});
});

describe('the error path of the dispatch', () => {
	it('marks a row of a channel without a driver failed and gives the job up as dead', async () => {
		const id = pushRow('queued');
		Queue.enqueue('notification.dispatch', { notificationId: id }, jobKey.dispatch(id));

		await worker().drain();

		expect(rowOf(id)).toMatchObject({
			status: 'failed',
			attempts: 1,
			error: 'channel push is not live'
		});
		// A retry cannot help: the driver arrives with a release, not with time.
		expect(jobs('notification.dispatch')[0]).toMatchObject({ status: 'dead', attempts: 1 });
	});

	it('gives up at once on a row that does not exist', async () => {
		Queue.enqueue('notification.dispatch', { notificationId: 999_999 }, jobKey.dispatch(999_999));

		await worker().drain();

		expect(jobs('notification.dispatch')[0]?.status).toBe('dead');
	});
});

function pushRow(status: 'queued' | 'sent'): number {
	const [row] = db
		.insert(notifications)
		.values({
			eventKey: 'request.ready',
			userId: world.adminId,
			channel: 'push',
			payload: { entityId: 1 },
			status,
			attempts: status === 'sent' ? 1 : 0
		})
		.returning()
		.all();
	return row?.id ?? 0;
}

function rowOf(id: number) {
	return db.select().from(notifications).where(eq(notifications.id, id)).all()[0];
}
