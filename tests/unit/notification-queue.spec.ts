import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules, seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	jobQueue,
	notificationTemplates,
	notifications,
	settings,
	userNotificationPrefs,
	users
} from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import { NotificationRuleRepository } from '../../src/lib/server/notifications/notification-rule.repository';
import { NotificationRepository } from '../../src/lib/server/notifications/notification.repository';
import { backoffSeconds } from '../../src/lib/server/queue/backoff';
import { createNotificationDispatchHandler } from '../../src/lib/server/queue/handlers/notification-dispatch';
import { createNotificationFanoutHandler } from '../../src/lib/server/queue/handlers/notification-fanout';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { charityOf, seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { world, actors, sent, drive } = seedCharityWorld(db);
seedNotificationRules(db);
seedNotificationTemplates(db);

const ORIGIN = 'https://portal.example';
const mail = new FakeMailDriver();
// Real time plus a shift: `visible_at` is stored in whole seconds when a job is queued, so a
// frozen clock would either miss fresh jobs or depend on the hour the suite runs at.
let offsetMs = 0;
const clock = (): Date => new Date(Date.now() + offsetMs);
let switchedOn = true;

function worker(): Worker {
	const rules = new NotificationRuleRepository();
	const rows = new NotificationRepository();
	return new Worker({
		handlers: [
			createNotificationFanoutHandler({ rules, notifications: rows, isEnabled: () => switchedOn }),
			createNotificationDispatchHandler({
				rules,
				notifications: rows,
				mail: () => mail,
				origin: ORIGIN,
				clock
			})
		],
		clock
	});
}

function rowsOf(eventKey: string) {
	return db
		.select()
		.from(notifications)
		.all()
		.filter((row) => row.eventKey === eventKey);
}

function mailTo(address: string) {
	return mail.sent.filter((message) => message.to === address);
}

function jobs(topic: 'notification.fanout' | 'notification.dispatch') {
	return db.select().from(jobQueue).where(eq(jobQueue.topic, topic)).all();
}

beforeEach(() => {
	resetRequests(db);
	db.delete(notifications).run();
	db.delete(userNotificationPrefs).run();
	db.update(users).set({ isActive: true }).run();
	db.update(notificationTemplates).set({ isActive: true }).run();
	mail.reset();
	switchedOn = true;
	offsetMs = 0;
});

describe('notification.fanout and notification.dispatch (P9)', () => {
	it('mails the administrator and the author when their request is ready', async () => {
		const id = sent(actors.employee);
		drive(id, 'ready');

		await worker().drain();

		expect(mailTo('admin@rs.example')).toHaveLength(1);
		expect(mailTo('employee@rs.example')).toHaveLength(1);
		expect(mailTo('admin@pamyat.example')).toHaveLength(0);
		expect(rowsOf('request.ready').map((row) => row.status)).toEqual(['sent', 'sent']);
	});

	it('keeps an employee out of requests written by someone else', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');

		await worker().drain();

		expect(mailTo('admin@rs.example')).toHaveLength(1);
		expect(mailTo('employee@rs.example')).toHaveLength(0);
	});

	it('builds the text from the request without any money', async () => {
		const id = sent(actors.employee);
		drive(id, 'delivered');

		await worker().drain();

		const [letter] = mailTo('employee@rs.example').filter((m) => m.subject.includes('доставлена'));
		// The chain of tech.md 6.2 has already moved on, and the letter says where the request is now.
		expect(letter?.text).toContain(`${ORIGIN}/portal/requests/${id}`);
		expect(letter?.text).toContain('Ожидает оплаты');
		const { totalMinor } = charityOf(db, id);
		const rubles = String(Math.floor(totalMinor / 100));
		expect(`${letter?.subject} ${letter?.text}`).not.toMatch(/₽|руб|копе/);
		expect(`${letter?.subject} ${letter?.text}`.replace(/\s/g, '')).not.toContain(rubles);
	});

	it('mails nobody when the workshop switch is off', async () => {
		switchedOn = false;
		const id = sent(actors.admin);
		drive(id, 'ready');

		await worker().drain();

		expect(mail.sent).toHaveLength(0);
		expect(db.select().from(notifications).all()).toHaveLength(0);
	});

	it('respects a personal switch over the role rule', async () => {
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

		await worker().drain();

		expect(mailTo('admin@rs.example')).toHaveLength(0);
	});

	it('sends nothing over MAX while its driver is still to come in C16', async () => {
		db.insert(userNotificationPrefs)
			.values({ userId: world.adminId, eventKey: 'request.ready', channel: 'max', enabled: true })
			.run();
		const id = sent(actors.admin);
		drive(id, 'ready');

		await worker().drain();

		expect(rowsOf('request.ready').map((row) => row.channel)).toEqual(['email']);
	});

	it('skips a disabled account', async () => {
		db.update(users).set({ isActive: false }).where(eq(users.id, world.adminId)).run();
		const id = sent(actors.employee);
		drive(id, 'ready');

		await worker().drain();

		expect(mailTo('admin@rs.example')).toHaveLength(0);
		expect(mailTo('employee@rs.example')).toHaveLength(1);
	});

	it('queues payloads that match the contract of tech.md 7.2', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await worker().drain();

		const all = [...jobs('notification.fanout'), ...jobs('notification.dispatch')];
		expect(all.length).toBeGreaterThan(0);
		for (const job of all) {
			expect(JOB_PAYLOAD_SCHEMAS[job.topic].safeParse(job.payload).success).toBe(true);
		}
		for (const job of jobs('notification.dispatch')) {
			expect(job.idempotencyKey).toBe(`notification:${String(job.payload['notificationId'])}`);
		}
	});
});

describe('idempotency of the notification jobs', () => {
	it('creates one row and one letter when the fanout runs twice', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await worker().drain();
		// Same payload again, as after a crash between the commit and `done`.
		db.update(jobQueue)
			.set({ status: 'pending', finishedAt: null })
			.where(eq(jobQueue.topic, 'notification.fanout'))
			.run();

		await worker().drain();

		expect(rowsOf('request.ready')).toHaveLength(1);
		expect(mailTo('admin@rs.example')).toHaveLength(1);
	});

	it('sends one letter when the dispatch runs twice', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		await worker().drain();
		db.update(jobQueue)
			.set({ status: 'pending', finishedAt: null })
			.where(eq(jobQueue.topic, 'notification.dispatch'))
			.run();

		await worker().drain();

		expect(mailTo('admin@rs.example')).toHaveLength(1);
		expect(rowsOf('request.ready')[0]).toMatchObject({ status: 'sent', attempts: 1 });
	});
});

describe('the error path of the dispatch', () => {
	it('marks a failed send, retries it with backoff and then marks it sent', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		mail.failOnce();
		const run = worker();

		const before = Date.now();
		await run.drain();
		const [failed] = rowsOf('request.ready');
		expect(failed).toMatchObject({
			status: 'failed',
			attempts: 1,
			error: 'fake mail driver failure'
		});
		const [job] = jobs('notification.dispatch');
		const delayMs = (job?.visibleAt.getTime() ?? 0) - before;
		// Whole seconds in storage: the delay lands within a second of the backoff.
		expect(Math.abs(delayMs - backoffSeconds(1) * 1000)).toBeLessThanOrEqual(1000);

		await run.drain();
		expect(rowsOf('request.ready')[0]?.status).toBe('failed');

		offsetMs = backoffSeconds(1) * 1000 + 1000;
		await run.drain();

		expect(rowsOf('request.ready')[0]).toMatchObject({ status: 'sent', attempts: 2, error: null });
		expect(mailTo('admin@rs.example')).toHaveLength(1);
	});

	it('gives up as dead after the last attempt and leaves the row failed', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		const rules = new NotificationRuleRepository();
		const rows = new NotificationRepository();
		const fanoutOnly = new Worker({
			handlers: [
				createNotificationFanoutHandler({ rules, notifications: rows, isEnabled: () => true })
			],
			clock
		});
		await fanoutOnly.drain();
		db.update(jobQueue)
			.set({ maxAttempts: 2 })
			.where(eq(jobQueue.topic, 'notification.dispatch'))
			.run();
		const down = {
			send: async () => {
				throw new Error('smtp is down');
			}
		};
		const run = new Worker({
			handlers: [
				createNotificationDispatchHandler({
					rules,
					notifications: rows,
					mail: () => down,
					origin: ORIGIN
				})
			],
			clock
		});

		await run.drain();
		offsetMs = backoffSeconds(1) * 1000 + 1000;
		await run.drain();

		expect(jobs('notification.dispatch')[0]).toMatchObject({ status: 'dead', attempts: 2 });
		expect(rowsOf('request.ready')[0]).toMatchObject({
			status: 'failed',
			attempts: 2,
			error: 'smtp is down'
		});
	});

	it('times a hanging server out and retries instead of waiting forever', async () => {
		const id = sent(actors.admin);
		drive(id, 'ready');
		mail.hangOnce();
		const run = new Worker({
			handlers: [
				createNotificationFanoutHandler({
					rules: new NotificationRuleRepository(),
					notifications: new NotificationRepository(),
					isEnabled: () => true
				}),
				createNotificationDispatchHandler({
					rules: new NotificationRuleRepository(),
					notifications: new NotificationRepository(),
					mail: () => mail,
					origin: ORIGIN
				})
			],
			timeoutMs: 20,
			clock
		});

		await run.drain();

		const [job] = jobs('notification.dispatch');
		expect(job).toMatchObject({ status: 'pending', attempts: 1 });
		expect(job?.lastError).toMatch(/exceeded/);
		expect(mail.sent).toHaveLength(0);
	});

	it('sends a row without an active template straight to dead', async () => {
		db.update(notificationTemplates)
			.set({ isActive: false })
			.where(eq(notificationTemplates.eventKey, 'request.ready'))
			.run();
		const id = sent(actors.admin);
		drive(id, 'ready');

		await worker().drain();

		expect(jobs('notification.dispatch')[0]).toMatchObject({ status: 'dead', attempts: 1 });
		expect(rowsOf('request.ready')[0]?.status).toBe('failed');
	});

	it('refuses a dispatch for a notification that does not exist', async () => {
		db.insert(jobQueue)
			.values({
				topic: 'notification.dispatch',
				payload: { notificationId: 999_999 },
				idempotencyKey: 'notification:999999',
				visibleAt: clock()
			})
			.run();

		await worker().drain();

		expect(jobs('notification.dispatch')[0]?.status).toBe('dead');
	});
});

describe('the workshop switch in settings', () => {
	it('is seeded on', () => {
		const [row] = db.select().from(settings).where(eq(settings.key, 'notifications.enabled')).all();
		expect(row?.value).toBe(true);
	});
});
