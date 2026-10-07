import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules, seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationFeed,
	notificationTemplates,
	notifications,
	pushSubscriptions,
	userNotificationPrefs
} from '../../src/lib/server/db/schema';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { world, ids, actors, sent, drive } = seedCharityWorld(db);
seedNotificationRules(db);
seedNotificationTemplates(db);
const subscriptions = new PushSubscriptionRepository();

function fanout(): Worker {
	return new Worker({
		handlers: [
			createNotificationFanoutHandler({
				rules: new NotificationRuleRepository(),
				notifications: new NotificationRepository(),
				subscriptions,
				isEnabled: () => true
			})
		]
	});
}

const device = (name: string) => ({
	endpoint: `https://push.example/${name}`,
	p256dh: 'k',
	auth: 'a'
});
const pushRows = () => db.select().from(notifications).all();
const pushedTo = () =>
	pushRows()
		.map((row) => row.userId)
		.sort();
const readyRows = () => pushRows().filter((row) => row.eventKey === 'request.ready');
const dispatchJobs = () =>
	db.select().from(jobQueue).where(eq(jobQueue.topic, 'notification.dispatch')).all();

beforeEach(() => {
	resetRequests(db);
	for (const table of [notificationFeed, notifications, userNotificationPrefs, pushSubscriptions]) {
		db.delete(table).run();
	}
	db.update(notificationTemplates).set({ isActive: true }).run();
});

describe('notification.fanout over the push channel (C15)', () => {
	it('queues a push for the driver with a device when a request turns ready', async () => {
		subscriptions.save(ids.driver, device('driver'));
		drive(sent(actors.admin), 'ready');

		await fanout().drain();

		expect(readyRows().map((row) => row.userId)).toEqual([ids.driver]);
		const jobs = dispatchJobs();
		expect(jobs).toHaveLength(pushRows().length);
		for (const job of jobs) {
			expect(JOB_PAYLOAD_SCHEMAS['notification.dispatch'].safeParse(job.payload).success).toBe(
				true
			);
			expect(job.idempotencyKey).toBe(`notification:${String(job.payload['notificationId'])}`);
		}
	});

	it('writes the feed and no push row for a person without a device', async () => {
		drive(sent(actors.admin), 'ready');

		await fanout().drain();

		expect(db.select().from(notificationFeed).all().length).toBeGreaterThan(0);
		expect(pushRows()).toEqual([]);
		expect(dispatchJobs()).toEqual([]);
	});

	it('respects a personal switch', async () => {
		subscriptions.save(world.adminId, device('admin'));
		db.insert(userNotificationPrefs)
			.values({ userId: world.adminId, eventKey: 'request.ready', channel: 'push', enabled: false })
			.run();
		drive(sent(actors.admin), 'ready');

		await fanout().drain();

		expect(readyRows()).toEqual([]);
		// The other events of the same request still reach the device.
		expect(pushedTo()).toContain(world.adminId);
	});

	it('queues nothing for an event whose template is switched off', async () => {
		subscriptions.save(ids.driver, device('driver'));
		db.update(notificationTemplates)
			.set({ isActive: false })
			.where(eq(notificationTemplates.eventKey, 'request.ready'))
			.run();
		drive(sent(actors.admin), 'ready');

		await fanout().drain();

		expect(readyRows()).toEqual([]);
	});

	it('leaves one push row per person when the fanout runs twice', async () => {
		subscriptions.save(ids.driver, device('driver'));
		drive(sent(actors.admin), 'ready');
		await fanout().drain();
		const before = pushedTo();
		db.update(jobQueue)
			.set({ status: 'pending', finishedAt: null })
			.where(eq(jobQueue.topic, 'notification.fanout'))
			.run();

		await fanout().drain();

		expect(pushedTo()).toEqual(before);
		expect(before).toEqual([ids.driver]);
	});
});
