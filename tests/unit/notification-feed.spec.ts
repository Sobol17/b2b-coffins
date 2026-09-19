import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules, seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationFeed,
	notifications,
	userNotificationPrefs
} from '../../src/lib/server/db/schema';
import { NotificationFeedService } from '../../src/lib/server/notifications/notification-feed.service';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { Worker } from '../../src/lib/server/queue/worker';
import { seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { world, actors, sent, drive } = seedCharityWorld(db);
seedNotificationRules(db);
seedNotificationTemplates(db);

/** Only the fanout runs here: the feed row is written before any driver touches a channel. */
function fanout(): Worker {
	return new Worker({
		handlers: [
			createNotificationFanoutHandler({
				rules: new NotificationRuleRepository(),
				notifications: new NotificationRepository(),
				isEnabled: () => true
			})
		]
	});
}

function feedOf(userId: number) {
	return db.select().from(notificationFeed).where(eq(notificationFeed.userId, userId)).all();
}

beforeEach(() => {
	resetRequests(db);
	db.delete(notificationFeed).run();
	db.delete(notifications).run();
	db.delete(userNotificationPrefs).run();
});

describe('the fanout mirrors an event into the feed (P12)', () => {
	it('writes one row for every addressee of the event', async () => {
		const id = sent(actors.employee);
		drive(id, 'ready');

		await fanout().drain();

		expect(feedOf(world.adminId)).toHaveLength(1);
		expect(feedOf(world.employeeId)).toHaveLength(1);
		expect(feedOf(world.outsiderId)).toHaveLength(0);
		expect(feedOf(world.adminId)[0]).toMatchObject({
			eventKey: 'request.ready',
			entityId: id,
			readAt: null
		});
	});

	it('leaves out an employee who did not write the request', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');

		await fanout().drain();

		expect(feedOf(world.adminId)).toHaveLength(1);
		expect(feedOf(world.employeeId)).toHaveLength(0);
	});

	it('writes the row even when the person switched the letter off', async () => {
		db.insert(userNotificationPrefs)
			.values({
				userId: world.adminId,
				eventKey: 'request.ready',
				channel: 'email',
				enabled: false
			})
			.run();
		const id = sent(actors.admin);
		drive(id, 'ready');

		await fanout().drain();

		expect(db.select().from(notifications).all()).toHaveLength(0);
		expect(feedOf(world.adminId)).toHaveLength(1);
	});

	it('writes one row when the same event fans out twice', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await fanout().drain();
		// Same payload again, as after a crash between the commit and `done`.
		db.update(jobQueue)
			.set({ status: 'pending', finishedAt: null })
			.where(eq(jobQueue.topic, 'notification.fanout'))
			.run();

		await fanout().drain();

		expect(feedOf(world.adminId)).toHaveLength(1);
	});
});

describe('the bell of the portal header (P12)', () => {
	it('counts the unread rows and hands out the newest ones with their request', async () => {
		const first = sent(actors.admin);
		drive(first, 'ready');
		const second = sent(actors.admin);
		drive(second, 'delivered');
		await fanout().drain();

		const bell = new NotificationFeedService(actors.admin).bell();

		expect(bell.unread).toBe(bell.items.length);
		expect(bell.items.length).toBeGreaterThanOrEqual(2);
		const [newest] = bell.items;
		expect(newest?.requestId).toBe(second);
		expect(newest?.requestNumber).toMatch(/^З-\d{4}-\d+$/);
		expect(newest?.isRead).toBe(false);
	});

	it('shows ten rows at most', async () => {
		for (let i = 0; i < 6; i += 1) drive(sent(actors.admin), 'delivered');
		await fanout().drain();

		const bell = new NotificationFeedService(actors.admin).bell();

		expect(bell.items).toHaveLength(10);
		expect(bell.unread).toBeGreaterThan(10);
	});

	it('keeps the feed of another counterparty out', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await fanout().drain();

		expect(new NotificationFeedService(actors.outsider).bell()).toEqual({ unread: 0, items: [] });
	});
});

describe('marking the feed read (P12)', () => {
	it('marks the rows the list showed and leaves the rest unread', async () => {
		for (let i = 0; i < 6; i += 1) drive(sent(actors.admin), 'delivered');
		await fanout().drain();
		const service = new NotificationFeedService(actors.admin);
		const before = service.bell();

		const unread = service.markRead(before.items.map((item) => item.id));

		expect(unread).toBe(before.unread - before.items.length);
		expect(service.bell().items.slice(0, before.items.length).every((i) => i.isRead)).toBe(true);
	});

	it('refuses to touch a row of another person', async () => {
		const id = sent(actors.employee);
		drive(id, 'ready');
		await fanout().drain();
		const [foreign] = feedOf(world.employeeId);

		expect(new NotificationFeedService(actors.admin).markRead([foreign?.id ?? 0])).toBe(1);
		expect(feedOf(world.employeeId)[0]?.readAt).toBeNull();
	});

	it('answers the same count when the same row is marked twice', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await fanout().drain();
		const service = new NotificationFeedService(actors.admin);
		const [item] = service.bell().items;

		expect(service.markRead([item?.id ?? 0])).toBe(0);
		expect(service.markRead([item?.id ?? 0])).toBe(0);
	});
});
