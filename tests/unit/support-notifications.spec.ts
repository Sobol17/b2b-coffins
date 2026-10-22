import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules, seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationFeed,
	notifications,
	pushSubscriptions,
	users
} from '../../src/lib/server/db/schema';
import { FakePushDriver } from '../../src/lib/server/notifications/drivers/push';
import { NotificationFeedService } from '../../src/lib/server/notifications/notification-feed.service';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { PushMessageService } from '../../src/lib/server/notifications/push-message.service';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationDispatchHandler } from '../../src/lib/server/queue/handlers/notification-dispatch';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { Worker } from '../../src/lib/server/queue/worker';
import { SupportPostingService } from '../../src/lib/server/support/support-posting.service';
import type { EventKey } from '../../src/lib/types/events';
import { migratedDatabase } from './helpers/db';
import { portalActor } from './helpers/portal-requests';
import { crmActor, openThread, resetSupport, supportWorld } from './helpers/support';

const db = migratedDatabase();
const world = supportWorld(db);
seedNotificationRules(db);
seedNotificationTemplates(db);
const admin = portalActor('cp_admin', world.adminId, world.cpId);
const employee = portalActor('cp_employee', world.employeeId, world.cpId);
const outsider = portalActor('cp_admin', world.outsiderId, world.otherCpId);
const manager = crmActor('manager', world.managerId);
const subscriptions = new PushSubscriptionRepository();
const pushDriver = new FakePushDriver();
const messages = new PushMessageService({ timeZone: () => 'UTC', origin: 'https://app.example' });

const fanoutHandler = () =>
	createNotificationFanoutHandler({
		rules: new NotificationRuleRepository(),
		notifications: new NotificationRepository(),
		subscriptions,
		isEnabled: () => true
	});
const fanout = () => new Worker({ handlers: [fanoutHandler()] });
const dispatch = () =>
	new Worker({
		handlers: [
			createNotificationDispatchHandler({
				notifications: new NotificationRepository(),
				subscriptions,
				messages,
				driver: () => pushDriver,
				timeoutMs: 50
			})
		]
	});

const device = (name: string) => ({
	endpoint: `https://push.example/${name}`,
	p256dh: 'k',
	auth: 'a'
});
const feedOf = (eventKey: EventKey) =>
	db
		.select({ userId: notificationFeed.userId })
		.from(notificationFeed)
		.where(eq(notificationFeed.eventKey, eventKey))
		.all()
		.map((row) => row.userId)
		.sort((a, b) => a - b);
const sorted = (...ids: number[]) => [...ids].sort((a, b) => a - b);

beforeEach(() => {
	resetSupport(db);
	pushDriver.reset();
	for (const table of [notificationFeed, notifications, pushSubscriptions, jobQueue]) {
		db.delete(table).run();
	}
	db.update(users).set({ isActive: true }).run();
});

describe('who hears of a support thread (tech.md 7.3, v1.57)', () => {
	it('tells the workshop managers and owner about an employee thread, not the driver or the cp_admin', async () => {
		openThread(employee);

		await fanout().drain();

		expect(feedOf('support.opened')).toEqual(sorted(world.managerId, world.ownerId));
	});

	it('tells the cp_admin and the author about a manager reply, never the manager who wrote it', async () => {
		const thread = openThread(employee);
		new SupportPostingService(manager).post(thread.id, { body: 'Успеем' });

		await fanout().drain();

		expect(feedOf('support.message_posted')).toEqual(sorted(world.adminId, world.employeeId));
	});

	it('tells the employee when the cp_admin writes in the employee thread', async () => {
		const thread = openThread(employee);
		new SupportPostingService(admin).post(thread.id, { body: 'Уточню за коллегу' });

		await fanout().drain();

		expect(feedOf('support.message_posted')).toEqual(
			sorted(world.employeeId, world.managerId, world.ownerId)
		);
	});

	it('tells the other side when a thread is closed', async () => {
		const thread = openThread(employee);
		new SupportPostingService(manager).close(thread.id);

		await fanout().drain();

		expect(feedOf('support.closed')).toEqual(sorted(world.adminId, world.employeeId));
	});

	it('runs the fanout of one message twice with one feed row and one push row per person', async () => {
		subscriptions.save(world.adminId, device('admin'));
		const thread = openThread(employee);
		new SupportPostingService(manager).post(thread.id, { body: 'Успеем' });
		await fanout().drain();
		// The same payload again, as after a crash between commit and `done`.
		db.update(jobQueue)
			.set({ status: 'pending', finishedAt: null })
			.where(eq(jobQueue.topic, 'notification.fanout'))
			.run();

		await fanout().drain();

		expect(feedOf('support.message_posted')).toEqual(sorted(world.adminId, world.employeeId));
		expect(
			db
				.select()
				.from(notifications)
				.all()
				.map((row) => row.userId)
		).toEqual([world.adminId]);
	});

	it('skips a deactivated author', async () => {
		const thread = openThread(employee);
		db.update(users).set({ isActive: false }).where(eq(users.id, world.employeeId)).run();
		new SupportPostingService(manager).post(thread.id, { body: 'Ответ' });

		await fanout().drain();

		expect(feedOf('support.message_posted')).toEqual([world.adminId]);
	});
});

describe('the push and the bell of a support event (v1.57)', () => {
	it('builds the push of a reply from the thread at send time', () => {
		const thread = openThread(employee, { subject: 'Обивка' });
		const reply = new SupportPostingService(manager).post(thread.id, {
			body: 'Ткань придёт в среду, заявку соберём к пятнице'
		});

		const push = messages.build({
			eventKey: 'support.message_posted',
			entityId: reply.id,
			userId: world.employeeId
		});

		expect(push).toEqual({
			title: `Обращение №${thread.id}: Обивка`,
			body: 'Анна Мастерова: Ткань придёт в среду, заявку соберём к пятнице',
			url: `/portal/support/${thread.id}`,
			tag: `support.message_posted:${reply.id}`
		});
	});

	it('leads the workshop to the CRM thread', () => {
		const thread = openThread(employee, { body: 'Успеете к пятнице?' });

		const push = messages.build({
			eventKey: 'support.opened',
			entityId: thread.id,
			userId: world.managerId
		});

		expect(push).toMatchObject({
			title: `Новое обращение №${thread.id}`,
			body: 'Ритуал-Сервис: Успеете к пятнице?',
			url: `/crm/support/${thread.id}`
		});
	});

	it('points a feed line of a message at the thread, labelled by the subject', async () => {
		const thread = openThread(employee, { subject: 'Обивка' });
		new SupportPostingService(manager).post(thread.id, { body: 'Ответ' });
		await fanout().drain();

		const [line] = new NotificationFeedService(employee).list().rows;

		expect(line).toMatchObject({
			eventKey: 'support.message_posted',
			entityId: thread.id,
			entityLabel: 'Обивка',
			requestId: null
		});
	});

	it('keeps a support feed line of another counterparty out of a portal reader', async () => {
		const thread = openThread(employee, { subject: 'Обивка' });
		new SupportPostingService(manager).post(thread.id, { body: 'Ответ' });
		await fanout().drain();
		// A row that somehow reached the wrong person must not reveal the foreign thread.
		const [own] = db.select().from(notificationFeed).all();
		db.insert(notificationFeed)
			.values({
				userId: world.outsiderId,
				eventKey: 'support.message_posted',
				entityId: own?.entityId ?? 0
			})
			.run();

		const [line] = new NotificationFeedService(outsider).list().rows;

		expect(line).toMatchObject({ entityId: null, entityLabel: null });
	});

	it('puts a failed push of a support event on retry like a request event', async () => {
		subscriptions.save(world.managerId, device('manager'));
		openThread(employee);
		await fanout().drain();
		pushDriver.failOnce();

		await dispatch().drain();

		const rows = db.select().from(notifications).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ status: 'failed', attempts: 1 });
		expect(rows[0]?.error).toMatch(/^driver: /);
		const job = db
			.select()
			.from(jobQueue)
			.where(eq(jobQueue.topic, 'notification.dispatch'))
			.all()[0];
		expect(job?.status).toBe('pending');
	});
});
