import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	seedNotificationRules,
	seedNotificationTemplates,
	syncNotificationFixtures
} from '../../scripts/seed/reference';
import {
	notificationFeed,
	notificationRules,
	notificationTemplates,
	notifications,
	pushSubscriptions,
	requests,
	shopTasks
} from '../../src/lib/server/db/schema';
import { bus } from '../../src/lib/server/events/bus';
import { NotificationFeedService } from '../../src/lib/server/notifications/notification-feed.service';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { PushMessageService } from '../../src/lib/server/notifications/push-message.service';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { Worker } from '../../src/lib/server/queue/worker';
import { eventPath } from '../../src/lib/domain/notification/link';
import { unknownVariables } from '../../src/lib/domain/notification/template';
import { crmFeedHref } from '../../src/lib/crm/notifications/feed-href';
import { EVENT_LABEL } from '../../src/lib/notifications/labels';
import type { WorkRole } from '../../src/lib/types/roles';
import { seedCharityWorld } from './helpers/charity';
import { insertUser, migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { ids, actors, sent } = seedCharityWorld(db);
seedNotificationRules(db);
seedNotificationTemplates(db);
const grinderId = insertUser({
	email: 'grind@notify.example',
	role: 'grinder',
	counterpartyId: null
});
const subscriptions = new PushSubscriptionRepository();
const messages = new PushMessageService({ timeZone: () => 'UTC', origin: 'https://app.example' });

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

/** A visit the dispatch would open: one request at one station, the event on its creation. */
function visit(station: WorkRole, urgent = false): { taskId: number; requestId: number } {
	const requestId = sent(actors.admin);
	if (urgent)
		db.update(requests).set({ priority: 'urgent' }).where(eq(requests.id, requestId)).run();
	const [task] = db.insert(shopTasks).values({ requestId, station }).returning().all();
	const taskId = task?.id ?? 0;
	bus.emit('shop.task_arrived', taskId);
	return { taskId, requestId };
}

function feedOf(userId: number) {
	return db
		.select()
		.from(notificationFeed)
		.where(
			and(eq(notificationFeed.userId, userId), eq(notificationFeed.eventKey, 'shop.task_arrived'))
		)
		.all();
}

const device = (name: string) => ({
	endpoint: `https://push.example/${name}`,
	p256dh: 'k',
	auth: 'a'
});

beforeEach(() => {
	resetRequests(db);
	for (const table of [notificationFeed, notifications, pushSubscriptions]) db.delete(table).run();
});

describe('shop.task_arrived reaches the station of the visit (tech.md §7.3)', () => {
	it('tells the carpenter and nobody else about a carpenter visit', async () => {
		const { taskId } = visit('carpenter');
		await fanout().drain();

		expect(feedOf(ids.carpenter).map((row) => row.entityId)).toEqual([taskId]);
		expect([feedOf(grinderId), feedOf(ids.manager), feedOf(ids.driver)]).toEqual([[], [], []]);
	});

	it('queues one push per worker with a device, also when the fanout runs twice', async () => {
		subscriptions.save(ids.carpenter, device('carp'));
		subscriptions.save(grinderId, device('grind'));
		visit('carpenter');
		await fanout().drain();
		await fanout().drain();

		const rows = db
			.select()
			.from(notifications)
			.where(eq(notifications.eventKey, 'shop.task_arrived'))
			.all();
		expect(rows.map((row) => [row.userId, row.channel])).toEqual([[ids.carpenter, 'push']]);
		expect(feedOf(ids.carpenter)).toHaveLength(1);
	});

	it('shows the bell line with the request number and leads to the visit', async () => {
		const { taskId } = visit('carpenter');
		await fanout().drain();

		const [item] = new NotificationFeedService(actors.carpenter).bell().items;
		const number = db.select().from(requests).all()[0]?.number;

		expect(item).toMatchObject({
			eventKey: 'shop.task_arrived',
			requestId: null,
			entityId: taskId,
			requestNumber: number
		});
		expect(item && crmFeedHref(false)(item)).toBe(`/crm/shop/${taskId}`);
		expect(EVENT_LABEL['shop.task_arrived']).toEqual({
			title: 'Новая заявка на станции',
			hint: 'Заявка пришла в работу на вашу станцию'
		});
	});
});

describe('push text of a new visit (tech.md §7.3)', () => {
	it('names the request, the station and an urgent priority and opens the visit', () => {
		const { taskId, requestId } = visit('carpenter', true);
		const number = db.select().from(requests).where(eq(requests.id, requestId)).all()[0]?.number;

		const push = messages.build({
			eventKey: 'shop.task_arrived',
			entityId: taskId,
			userId: ids.carpenter
		});

		expect(push).toEqual({
			title: `Новая заявка ${number}`,
			body: 'Столяр: срочная заявка в работу',
			url: `/crm/shop/${taskId}`,
			tag: `shop.task_arrived:${taskId}`
		});
	});

	it('calls a normal request «обычная» and builds nothing for a missing visit', () => {
		const { taskId } = visit('grinder');

		expect(
			messages.build({ eventKey: 'shop.task_arrived', entityId: taskId, userId: grinderId })?.body
		).toBe('Шлифовщик: обычная заявка в работу');
		expect(
			messages.build({ eventKey: 'shop.task_arrived', entityId: 999_999, userId: grinderId })
		).toBeNull();
	});

	it('offers number, station, priority and url and leads every reader to the visit', () => {
		expect(
			unknownVariables(
				'shop.task_arrived',
				'{{number}} {{station}} {{priority}} {{url}} {{counterparty}}'
			)
		).toEqual(['counterparty']);
		expect(eventPath('shop.task_arrived', 7, 'crm_floor')).toBe('/crm/shop/7');
		expect(eventPath('shop.task_arrived', 7, 'crm_registry')).toBe('/crm/shop/7');
	});
});

describe('notifications:sync brings the shop rows to an old stand', () => {
	it('adds four push rules and the template once', () => {
		const shop = eq(notificationRules.eventKey, 'shop.task_arrived');
		db.delete(notificationRules).where(shop).run();
		db.delete(notificationTemplates)
			.where(eq(notificationTemplates.eventKey, 'shop.task_arrived'))
			.run();

		expect(syncNotificationFixtures(db)).toEqual({ rules: 4, templates: 1 });
		expect(
			db
				.select()
				.from(notificationRules)
				.where(shop)
				.all()
				.map((row) => [row.roleCode, row.channel, row.enabled])
				.sort()
		).toEqual([
			['carpenter', 'push', true],
			['grinder', 'push', true],
			['painter', 'push', true],
			['upholsterer', 'push', true]
		]);
		expect(syncNotificationFixtures(db)).toEqual({ rules: 0, templates: 0 });
	});
});
