import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationFeed,
	notifications,
	payrollPeriods,
	stockItems,
	userNotificationPrefs
} from '../../src/lib/server/db/schema';
import { bus } from '../../src/lib/server/events/bus';
import { NotificationFeedService } from '../../src/lib/server/notifications/notification-feed.service';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { Worker } from '../../src/lib/server/queue/worker';
import type { EventKey } from '../../src/lib/types/events';
import { seedCharityWorld } from './helpers/charity';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { world, actors, sent, drive } = seedCharityWorld(db);
seedNotificationRules(db);
const owner = crmActor(
	'owner',
	insertUser({ email: 'own@feed.example', role: 'owner', counterpartyId: null })
);

/** Only the fanout runs here: the feed row is written before any driver touches a channel. */
function fanout(): Worker {
	return new Worker({
		handlers: [
			createNotificationFanoutHandler({
				rules: new NotificationRuleRepository(),
				notifications: new NotificationRepository(),
				subscriptions: new PushSubscriptionRepository(),
				isEnabled: () => true
			})
		]
	});
}

/** Rows of one event: on its way to `ready` a request also tells the portal it was accepted. */
function feedOf(userId: number, eventKey: EventKey = 'request.ready') {
	return db
		.select()
		.from(notificationFeed)
		.where(and(eq(notificationFeed.userId, userId), eq(notificationFeed.eventKey, eventKey)))
		.all();
}

beforeEach(() => {
	resetRequests(db);
	db.delete(notificationFeed).run();
	db.delete(payrollPeriods).run();
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

	it('writes the row even when the person switched the channel off', async () => {
		db.insert(userNotificationPrefs)
			.values({
				userId: world.adminId,
				eventKey: 'request.ready',
				channel: 'push',
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
		expect(
			service
				.bell()
				.items.slice(0, before.items.length)
				.every((i) => i.isRead)
		).toBe(true);
	});

	it('refuses to touch a row of another person', async () => {
		const id = sent(actors.employee);
		drive(id, 'ready');
		await fanout().drain();
		const [foreign] = feedOf(world.employeeId);

		const mine = new NotificationFeedService(actors.admin).bell().unread;

		expect(new NotificationFeedService(actors.admin).markRead([foreign?.id ?? 0])).toBe(mine);
		expect(feedOf(world.employeeId)[0]?.readAt).toBeNull();
	});

	it('answers the same count when the same row is marked twice', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await fanout().drain();
		const service = new NotificationFeedService(actors.admin);
		const { unread, items } = service.bell();

		expect(service.markRead([items[0]?.id ?? 0])).toBe(unread - 1);
		expect(service.markRead([items[0]?.id ?? 0])).toBe(unread - 1);
	});
});

describe('the bell of the workshop header (C12)', () => {
	it('shows a workshop reader the request of any counterparty', async () => {
		const id = sent(actors.outsider);
		await fanout().drain();

		const [item] = new NotificationFeedService(actors.manager).bell().items;

		expect(item).toMatchObject({ eventKey: 'request.submitted', requestId: id, isRead: false });
		expect(item?.requestNumber).toMatch(/^З-\d{4}-\d+$/);
	});

	it('names the stock item of a low shelf and the first day of a closed week', async () => {
		const [item] = db.select().from(stockItems).limit(1).all();
		const [week] = db
			.insert(payrollPeriods)
			.values({
				startsOn: new Date('2026-09-27T21:00:00.000Z'),
				endsOn: new Date('2026-10-04T21:00:00.000Z')
			})
			.returning()
			.all();
		bus.emit('stock.below_threshold', item?.id ?? 0);
		bus.emit('payroll.week_closed', week?.id ?? 0);
		await fanout().drain();

		const items = new NotificationFeedService(owner).bell().items;

		expect(items.find((row) => row.eventKey === 'stock.below_threshold')).toMatchObject({
			requestId: null,
			entityId: item?.id,
			entityLabel: item?.title
		});
		// The week starts at midnight of the organisation, Moscow in the seed.
		expect(items.find((row) => row.eventKey === 'payroll.week_closed')).toMatchObject({
			entityId: week?.id,
			entityLabel: '28.09.2026'
		});
	});

	it('never hands a workshop entity to a portal reader', async () => {
		const [item] = db.select().from(stockItems).limit(1).all();
		// A row that should not exist: the fanout keeps stock events inside the workshop.
		db.insert(notificationFeed)
			.values({ userId: world.adminId, eventKey: 'stock.below_threshold', entityId: item?.id ?? 0 })
			.run();

		const [row] = new NotificationFeedService(actors.admin).bell().items;

		expect(row).toMatchObject({ requestId: null, entityId: null, entityLabel: null });
	});

	it('marks the own rows of a workshop reader read', async () => {
		sent(actors.admin);
		await fanout().drain();
		const service = new NotificationFeedService(actors.manager);

		expect(service.markRead(service.bell().items.map((row) => row.id))).toBe(0);
	});
});
