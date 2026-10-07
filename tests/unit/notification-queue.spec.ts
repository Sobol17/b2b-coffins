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
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
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
	return new Worker({
		handlers: [
			createNotificationFanoutHandler({
				rules: new NotificationRuleRepository(),
				notifications: new NotificationRepository(),
				subscriptions: new PushSubscriptionRepository(),
				isEnabled: () => switchedOn
			})
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

describe('contract of the fanout job', () => {
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
});
