import { desc } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import {
	auditLog,
	notifications,
	notificationTemplates,
	pushSubscriptions
} from '../../src/lib/server/db/schema';
import { FakePushDriver } from '../../src/lib/server/notifications/drivers/push';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { PushTemplateService } from '../../src/lib/server/notifications/push-template.service';
import type { ActorContext } from '../../src/lib/types/actor';
import { EVENT_KEYS } from '../../src/lib/types/events';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const ownerId = insertUser({ email: 'own@tpl.example', role: 'owner', counterpartyId: null });
const managerId = insertUser({ email: 'mgr@tpl.example', role: 'manager', counterpartyId: null });
const driver = new FakePushDriver();
const subscriptions = new PushSubscriptionRepository();

const ctx = (userId: number, role: 'owner' | 'manager'): ActorContext => ({
	userId,
	scope: 'crm',
	roles: [role],
	counterpartyId: null,
	canSeePrices: true,
	canSeeCost: true,
	requestId: 'test'
});
const service = (actor = ctx(ownerId, 'owner')) =>
	new PushTemplateService(actor, { driver: () => driver });
const form = {
	eventKey: 'request.ready' as const,
	title: 'Готова {{number}}',
	body: 'Заберите до вечера',
	isActive: true
};
const ready = () =>
	service()
		.list()
		.find((item) => item.eventKey === 'request.ready');

beforeEach(() => {
	driver.reset();
	for (const table of [notificationTemplates, pushSubscriptions, auditLog, notifications]) {
		db.delete(table).run();
	}
	seedNotificationTemplates(db);
});

describe('push templates in the CRM (C15)', () => {
	it('lists one template per event with the variables it may use', () => {
		const list = service().list();

		expect(list.map((item) => item.eventKey)).toEqual([...EVENT_KEYS]);
		expect(list.find((item) => item.eventKey === 'payroll.week_closed')?.variables).toEqual([
			'period',
			'url'
		]);
		expect(ready()).toMatchObject({ title: 'Заявка {{number}} готова', isActive: true });
	});

	it('saves a text and writes the old and the new one to the audit', () => {
		const saved = service().save(form);

		expect(saved).toMatchObject({ title: form.title, body: form.body, isActive: true });
		expect(ready()).toMatchObject({ title: form.title, body: form.body });
		const [entry] = db.select().from(auditLog).orderBy(desc(auditLog.id)).all();
		expect(entry).toMatchObject({
			action: 'notifications.template.update',
			entity: 'notification_templates',
			actorId: ownerId
		});
		expect(entry?.before).toMatchObject({ subject: 'Заявка {{number}} готова' });
		expect(entry?.after).toMatchObject({ subject: form.title, body: form.body, isActive: true });
	});

	it('switches a template off', () => {
		expect(service().save({ ...form, isActive: false }).isActive).toBe(false);
		expect(ready()?.isActive).toBe(false);
	});

	it('creates the row of an event that had no template', () => {
		db.delete(notificationTemplates).run();
		expect(ready()).toMatchObject({ title: '', body: '', isActive: false });

		expect(service().save(form).title).toBe(form.title);
		expect(db.select().from(notificationTemplates).all()).toHaveLength(1);
	});

	it('refuses a variable of another event and leaves the text alone', () => {
		expect(() => service().save({ ...form, body: 'Остаток {{balance}}' })).toThrow(ValidationError);
		expect(ready()?.body).toBe('Изделия готовы к выдаче');
		expect(db.select().from(auditLog).all()).toEqual([]);
	});

	it('previews on sample values without reading a request', () => {
		expect(service().preview(form)).toEqual({
			title: 'Готова 2026-0042',
			body: 'Заберите до вечера'
		});
	});

	it('sends the preview to the devices of the owner and writes no log row', async () => {
		subscriptions.save(ownerId, { endpoint: 'https://push.example/owner', p256dh: 'k', auth: 'a' });

		expect(await service().sendTest(form)).toBe(1);

		expect(driver.sent[0]?.message).toEqual({
			title: 'Готова 2026-0042',
			body: 'Заберите до вечера',
			url: '/crm/settings/notifications/templates',
			tag: 'test:request.ready'
		});
		expect(db.select().from(notifications).all()).toEqual([]);
		// A test send saves nothing: the stored text is still the seeded one.
		expect(ready()?.title).toBe('Заявка {{number}} готова');
	});

	it('asks to enable push first when the owner has no device', async () => {
		await expect(service().sendTest(form)).rejects.toThrow(
			'Включите уведомления на этом устройстве'
		);
	});

	it('says so when the push service takes the test on no device', async () => {
		subscriptions.save(ownerId, { endpoint: 'https://push.example/owner', p256dh: 'k', auth: 'a' });
		driver.failOnce();

		await expect(service().sendTest(form)).rejects.toThrow(ValidationError);
	});

	it('is closed to everyone without settings.manage', async () => {
		const manager = service(ctx(managerId, 'manager'));
		expect(() => manager.list()).toThrow(ForbiddenError);
		expect(() => manager.save(form)).toThrow(ForbiddenError);
		expect(() => manager.preview(form)).toThrow(ForbiddenError);
		await expect(manager.sendTest(form)).rejects.toThrow(ForbiddenError);
	});
});
