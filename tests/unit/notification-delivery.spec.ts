import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { notifications } from '../../src/lib/server/db/schema';
import { NotificationDeliveryService } from '../../src/lib/server/notifications/notification-delivery.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { EventKey } from '../../src/lib/types/events';
import type { DeliveryFilters } from '../../src/lib/validation/push';
import { seedCharityWorld } from './helpers/charity';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const { world, ids, actors, sent } = seedCharityWorld(db);
const ownerId = insertUser({
	email: 'own@log.example',
	role: 'owner',
	counterpartyId: null,
	fullName: 'Хозяин'
});
const requestId = sent(actors.admin);

const owner: ActorContext = {
	userId: ownerId,
	scope: 'crm',
	roles: ['owner'],
	counterpartyId: null,
	canSeePrices: true,
	canSeeCost: true,
	requestId: 't'
};
const log = (filters: DeliveryFilters = {}) =>
	new NotificationDeliveryService(owner).page({ page: 1, perPage: 20, filters });

function row(
	userId: number,
	status: 'sent' | 'failed',
	error: string | null,
	eventKey: EventKey = 'request.ready'
): void {
	db.insert(notifications)
		.values({
			eventKey,
			userId,
			channel: 'push',
			payload: { entityId: requestId },
			status,
			attempts: 1,
			error
		})
		.run();
}

beforeEach(() => db.delete(notifications).run());

describe('delivery log of the owner (C15)', () => {
	it('lists the pushes of every person, portal and workshop, newest first', () => {
		row(ids.driver, 'sent', null);
		row(world.adminId, 'failed', 'driver: 503 from fcm.googleapis.com');

		const page = log();

		expect(page.total).toBe(2);
		expect(page.rows.map((item) => item.userId)).toEqual([world.adminId, ids.driver]);
		expect(page.rows[0]).toMatchObject({ status: 'failed', failure: 'driver', requestId });
		expect(page.rows[1]).toMatchObject({ status: 'sent', failure: null });
		expect(page.rows[1]?.userName.length).toBeGreaterThan(0);
		expect(page.rows[1]?.requestNumber).toBeTruthy();
	});

	it('names the reason and never the answer of the push service', () => {
		row(ids.driver, 'failed', 'expired: every subscription is gone');
		row(ids.driver, 'failed', 'driver: 503 from fcm.googleapis.com');

		const body = JSON.stringify(log());

		expect(body).toContain('"failure":"expired"');
		expect(body).toContain('"failure":"driver"');
		expect(body).not.toContain('fcm.googleapis.com');
		expect(body).not.toMatch(/Minor/);
	});

	it('links a request event to its request and nothing else', () => {
		row(ids.manager, 'sent', null, 'stock.below_threshold');

		expect(log().rows[0]).toMatchObject({ requestId: null, requestNumber: null });
	});

	it('filters by event and by status', () => {
		row(ids.driver, 'sent', null);
		row(ids.driver, 'failed', 'driver: x', 'request.paid');

		expect(log({ status: 'failed' }).rows.map((item) => item.eventKey)).toEqual(['request.paid']);
		expect(log({ eventKey: 'request.ready' }).rows.map((item) => item.status)).toEqual(['sent']);
		expect(log({ eventKey: 'request.ready', status: 'failed' }).total).toBe(0);
	});

	it('pages the log', () => {
		for (let i = 0; i < 3; i += 1) row(ids.driver, 'sent', null);

		const page = new NotificationDeliveryService(owner).page({ page: 2, perPage: 2 });

		expect(page).toMatchObject({ total: 3, page: 2, perPage: 2 });
		expect(page.rows).toHaveLength(1);
	});

	it('is closed to everyone without settings.manage', () => {
		const manager: ActorContext = { ...owner, userId: ids.manager, roles: ['manager'] };
		expect(() => new NotificationDeliveryService(manager).page()).toThrow(ForbiddenError);
	});
});
