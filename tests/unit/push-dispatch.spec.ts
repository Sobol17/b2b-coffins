import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationTemplates,
	notifications,
	pushSubscriptions,
	users
} from '../../src/lib/server/db/schema';
import { FakePushDriver } from '../../src/lib/server/notifications/drivers/push';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { PushMessageService } from '../../src/lib/server/notifications/push-message.service';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { createNotificationDispatchHandler } from '../../src/lib/server/queue/handlers/notification-dispatch';
import { Queue } from '../../src/lib/server/queue/queue';
import { jobKey } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const { ids, actors, sent } = seedCharityWorld(db);
seedNotificationTemplates(db);
const requestId = sent(actors.admin);
const driver = new FakePushDriver();
const subscriptions = new PushSubscriptionRepository();

function worker(): Worker {
	return new Worker({
		handlers: [
			createNotificationDispatchHandler({
				notifications: new NotificationRepository(),
				subscriptions,
				messages: new PushMessageService(),
				driver: () => driver,
				timeoutMs: 50
			})
		]
	});
}

function queued(entityId = requestId): number {
	const [row] = db
		.insert(notifications)
		.values({
			eventKey: 'request.ready',
			userId: ids.driver,
			channel: 'push',
			payload: { entityId }
		})
		.returning()
		.all();
	const id = row?.id ?? 0;
	Queue.enqueue('notification.dispatch', { notificationId: id }, jobKey.dispatch(id));
	return id;
}

const rowOf = (id: number) =>
	db.select().from(notifications).where(eq(notifications.id, id)).all()[0];
const job = () => db.select().from(jobQueue).all()[0];
const device = (name: string) => ({
	endpoint: `https://push.example/${name}`,
	p256dh: 'k',
	auth: 'a'
});
/** Makes a retried job visible at once: the backoff is not what these tests are about. */
const rewind = () =>
	db
		.update(jobQueue)
		.set({ visibleAt: new Date(0) })
		.run();

beforeEach(() => {
	driver.reset();
	for (const table of [jobQueue, notifications, pushSubscriptions]) db.delete(table).run();
	db.update(notificationTemplates).set({ isActive: true }).run();
	db.update(users).set({ isActive: true }).run();
});

describe('notification.dispatch over the push channel (C15)', () => {
	it('sends the row to every device of the person and marks it sent', async () => {
		subscriptions.save(ids.driver, device('phone'));
		subscriptions.save(ids.driver, device('tablet'));
		const id = queued();

		await worker().drain();

		expect(driver.sent.map((push) => push.target.endpoint).sort()).toEqual([
			'https://push.example/phone',
			'https://push.example/tablet'
		]);
		expect(driver.sent[0]?.message).toMatchObject({
			url: '/crm/delivery',
			tag: `request.ready:${requestId}`
		});
		expect(rowOf(id)).toMatchObject({ status: 'sent', attempts: 1, error: null });
		expect(subscriptions.liveOf(ids.driver)).toHaveLength(2);
	});

	it('sends once when the same payload runs twice', async () => {
		subscriptions.save(ids.driver, device('phone'));
		const id = queued();
		await worker().drain();
		db.update(jobQueue).set({ status: 'pending', finishedAt: null }).run();

		await worker().drain();

		expect(driver.sent).toHaveLength(1);
		expect(rowOf(id)).toMatchObject({ status: 'sent', attempts: 1 });
	});

	it('retires a device the push service no longer knows and still delivers to the other', async () => {
		subscriptions.save(ids.driver, device('phone'));
		subscriptions.save(ids.driver, device('tablet'));
		driver.goneOnce();
		const id = queued();

		await worker().drain();

		expect(rowOf(id)?.status).toBe('sent');
		expect(subscriptions.liveOf(ids.driver).map((row) => row.endpoint)).toEqual([
			'https://push.example/tablet'
		]);
	});

	it('marks the row failed as expired, without a retry, when every device is gone', async () => {
		subscriptions.save(ids.driver, device('phone'));
		driver.goneOnce();
		const id = queued();

		await worker().drain();

		expect(rowOf(id)).toMatchObject({ status: 'failed', attempts: 1 });
		expect(rowOf(id)?.error).toMatch(/^expired: /);
		expect(job()).toMatchObject({ status: 'done', attempts: 1 });
	});

	it('fails without a retry when the person has no live device', async () => {
		const id = queued();

		await worker().drain();

		expect(rowOf(id)?.error).toMatch(/^expired: /);
		expect(job()?.status).toBe('done');
	});

	it('sends nothing to a person deactivated after the row was queued', async () => {
		subscriptions.save(ids.driver, device('phone'));
		db.update(users).set({ isActive: false }).where(eq(users.id, ids.driver)).run();
		const id = queued();

		await worker().drain();

		expect(driver.sent).toHaveLength(0);
		expect(rowOf(id)?.status).toBe('failed');
		expect(job()?.status).toBe('done');
	});

	it('fails once, without a retry, when the request is gone', async () => {
		subscriptions.save(ids.driver, device('phone'));
		const gone = queued(999_999);

		await worker().drain();

		expect(rowOf(gone)?.error).toMatch(/^driver: /);
		expect(job()).toMatchObject({ status: 'done', attempts: 1 });
		expect(driver.sent).toHaveLength(0);
	});

	it('fails once, without a retry, when the template was switched off', async () => {
		subscriptions.save(ids.driver, device('phone'));
		db.update(notificationTemplates).set({ isActive: false }).run();
		const id = queued();

		await worker().drain();

		expect(rowOf(id)?.error).toMatch(/^driver: /);
		expect(job()?.status).toBe('done');
	});

	it('retries a driver failure and delivers on the second attempt', async () => {
		subscriptions.save(ids.driver, device('phone'));
		driver.failOnce();
		const id = queued();

		await worker().drain();
		expect(rowOf(id)).toMatchObject({ status: 'failed', attempts: 1 });
		expect(rowOf(id)?.error).toMatch(/^driver: /);
		expect(job()?.status).toBe('pending');

		rewind();
		await worker().drain();
		expect(rowOf(id)).toMatchObject({ status: 'sent', attempts: 2, error: null });
	});

	it('treats a hanging push service as a failure and retries', async () => {
		subscriptions.save(ids.driver, device('phone'));
		driver.hangOnce();
		const id = queued();

		await worker().drain();

		expect(rowOf(id)?.error).toMatch(/^driver: .*timed out/);
		expect(job()?.status).toBe('pending');
	});

	it('gives the job up as dead after the last attempt', async () => {
		subscriptions.save(ids.driver, device('phone'));
		const id = queued();
		for (let attempt = 0; attempt < 5; attempt += 1) {
			driver.failOnce();
			rewind();
			await worker().drain();
		}

		expect(rowOf(id)).toMatchObject({ status: 'failed', attempts: 5 });
		expect(job()).toMatchObject({ status: 'dead', attempts: 5 });
	});

	it('gives up at once on a row that does not exist', async () => {
		Queue.enqueue('notification.dispatch', { notificationId: 999_999 }, jobKey.dispatch(999_999));

		await worker().drain();

		expect(job()?.status).toBe('dead');
	});
});
