import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import {
	notificationTemplates,
	payrollPeriods,
	requests,
	stockItems
} from '../../src/lib/server/db/schema';
import { PushMessageService } from '../../src/lib/server/notifications/push-message.service';
import { REQUEST_EVENT_KEYS, type EventKey } from '../../src/lib/types/events';
import { seedCharityWorld } from './helpers/charity';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const { world, ids, actors, sent } = seedCharityWorld(db);
const messages = new PushMessageService({ timeZone: () => 'UTC', origin: 'https://app.example' });
// The handler of tech.md 17.2 reads these four fields and nothing else.
const wire = z.strictObject({
	title: z.string().min(1).max(80),
	body: z.string().min(1).max(200),
	url: z.string().regex(/^\/(?!\/)/),
	tag: z.string().min(1)
});

let requestId = 0;
let number = '';

const template = (eventKey: EventKey) => eq(notificationTemplates.eventKey, eventKey);

beforeAll(() => {
	requestId = sent(actors.admin);
	number = db.select().from(requests).where(eq(requests.id, requestId)).all()[0]?.number ?? '';
});

beforeEach(() => {
	db.delete(notificationTemplates).run();
	seedNotificationTemplates(db);
});

describe('push message of a notification row (C15)', () => {
	it('carries the number, a short text and a path for every request event', () => {
		for (const eventKey of REQUEST_EVENT_KEYS) {
			const message = messages.build({ eventKey, entityId: requestId, userId: world.adminId });

			expect(wire.safeParse(message).success).toBe(true);
			expect(message?.tag).toBe(`${eventKey}:${requestId}`);
			expect(message?.url).toBe(`/portal/requests/${requestId}`);
			expect(`${message?.title} ${message?.body}`).toContain(number);
		}
	});

	it('leads each reader to a screen they may open', () => {
		const row = { eventKey: 'request.ready' as const, entityId: requestId };

		expect(messages.build({ ...row, userId: ids.manager })?.url).toBe(`/crm/requests/${requestId}`);
		expect(messages.build({ ...row, userId: ids.driver })?.url).toBe('/crm/delivery');
	});

	it('keeps money and the name of the deceased out of the text', () => {
		const request = db.select().from(requests).where(eq(requests.id, requestId)).all()[0];
		db.update(notificationTemplates)
			.set({ body: '{{counterparty}} {{status}} {{externalNumber}} {{url}}' })
			.where(template('request.ready'))
			.run();

		const message = messages.build({
			eventKey: 'request.ready',
			entityId: requestId,
			userId: world.adminId
		});
		const text = JSON.stringify(message);

		expect(message?.body).toContain(`https://app.example/portal/requests/${requestId}`);
		expect(text).not.toMatch(/Minor|₽/);
		expect(request?.deceasedName).toBeTruthy();
		expect(text).not.toContain(String(request?.deceasedName));
		expect(request?.totalMinor).toBeGreaterThan(0);
		expect(text).not.toContain(String(request?.totalMinor));
	});

	it('clips a text that grew past the limit of a notification', () => {
		db.update(notificationTemplates)
			.set({
				subject: Array(10).fill('{{counterparty}}').join(' '),
				body: Array(30).fill('{{counterparty}}').join(' ')
			})
			.where(template('request.paid'))
			.run();

		const message = messages.build({
			eventKey: 'request.paid',
			entityId: requestId,
			userId: world.adminId
		});

		expect(wire.safeParse(message).success).toBe(true);
		expect(message?.title.endsWith('…')).toBe(true);
		expect(message?.body.endsWith('…')).toBe(true);
	});

	it('describes a low shelf by the item and its balance', () => {
		const item = db.select().from(stockItems).all()[0];
		const message = messages.build({
			eventKey: 'stock.below_threshold',
			entityId: item?.id ?? 0,
			userId: ids.manager
		});

		expect(wire.safeParse(message).success).toBe(true);
		expect(message?.url).toBe(`/crm/stock/${item?.id}`);
		expect(message?.body).toContain(String(item?.title));
	});

	it('names both ends of a closed payroll week and opens that week', () => {
		const [week] = db
			.insert(payrollPeriods)
			.values({
				startsOn: new Date('2026-10-05T00:00:00Z'),
				endsOn: new Date('2026-10-11T00:00:00Z')
			})
			.returning()
			.all();

		const message = messages.build({
			eventKey: 'payroll.week_closed',
			entityId: week?.id ?? 0,
			userId: ids.manager
		});

		expect(message?.url).toBe('/crm/payroll?week=2026-10-05');
		expect(message?.body).toContain('05.10.2026 по 11.10.2026');
	});

	it('builds nothing without an active template, the entity or the person', () => {
		db.update(notificationTemplates)
			.set({ isActive: false })
			.where(template('request.delivered'))
			.run();
		const row = { entityId: requestId, userId: world.adminId };

		expect(messages.build({ ...row, eventKey: 'request.delivered' })).toBeNull();
		expect(messages.build({ ...row, eventKey: 'request.accepted', entityId: 999_999 })).toBeNull();
		expect(
			messages.build({ ...row, eventKey: 'stock.below_threshold', entityId: 999_999 })
		).toBeNull();
		expect(
			messages.build({ ...row, eventKey: 'payroll.week_closed', entityId: 999_999 })
		).toBeNull();
		expect(messages.build({ ...row, eventKey: 'request.accepted', userId: 999_999 })).toBeNull();
	});
});
