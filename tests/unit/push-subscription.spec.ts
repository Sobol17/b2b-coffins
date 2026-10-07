import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { pushSubscriptions, users } from '../../src/lib/server/db/schema';
import { PushSubscriptionRepository } from '../../src/lib/server/notifications/push-subscription.repository';
import { PushSubscriptionService } from '../../src/lib/server/notifications/push-subscription.service';
import type { ActorContext } from '../../src/lib/types/actor';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const repo = new PushSubscriptionRepository();
const driverId = insertUser({ email: 'drv@push.example', role: 'driver', counterpartyId: null });
const otherId = insertUser({ email: 'mgr@push.example', role: 'manager', counterpartyId: null });
const agencyId = insertCounterparty('Агентство пушей');
const portalId = insertUser({
	email: 'cp@push.example',
	role: 'cp_employee',
	counterpartyId: agencyId
});

const phone = { endpoint: 'https://push.example/sub/phone', p256dh: 'k1', auth: 'a1' };
const tablet = { endpoint: 'https://push.example/sub/tablet', p256dh: 'k2', auth: 'a2' };

function actor(
	userId: number,
	scope: 'crm' | 'portal',
	roles: ActorContext['roles']
): ActorContext {
	return {
		userId,
		scope,
		roles,
		counterpartyId: scope === 'portal' ? agencyId : null,
		canSeePrices: false,
		canSeeCost: false,
		requestId: 'test'
	};
}
const driver = actor(driverId, 'crm', ['driver']);
const other = actor(otherId, 'crm', ['manager']);
const service = (ctx: ActorContext) => new PushSubscriptionService(ctx, repo, 'public-key');

beforeEach(() => {
	db.delete(pushSubscriptions).run();
	db.update(users).set({ isActive: true, deletedAt: null }).run();
});

describe('push subscriptions (C15)', () => {
	it('stores every device of a person and counts them', () => {
		service(driver).subscribe(phone);

		expect(service(driver).subscribe(tablet)).toEqual({ publicKey: 'public-key', deviceCount: 2 });
		expect(
			repo
				.liveOf(driverId)
				.map((row) => row.endpoint)
				.sort()
		).toEqual([phone.endpoint, tablet.endpoint]);
	});

	it('keeps one row when the same device subscribes twice and takes the new keys', () => {
		service(driver).subscribe(phone);
		service(driver).subscribe({ ...phone, p256dh: 'rotated' });

		expect(repo.liveOf(driverId)).toMatchObject([{ endpoint: phone.endpoint, p256dh: 'rotated' }]);
	});

	it('moves a device to the person who subscribed on it last', () => {
		service(driver).subscribe(phone);

		service(other).subscribe(phone);

		expect(repo.liveOf(driverId)).toEqual([]);
		expect(repo.liveOf(otherId)).toHaveLength(1);
	});

	it('brings an expired device back when it subscribes again', () => {
		service(driver).subscribe(phone);
		const [row] = repo.liveOf(driverId);
		repo.markExpired(row?.id ?? 0, new Date());
		expect(repo.hasLive(driverId)).toBe(false);

		service(driver).subscribe(phone);

		expect(repo.hasLive(driverId)).toBe(true);
	});

	it('sends nothing to a deactivated or deleted account', () => {
		service(driver).subscribe(phone);

		db.update(users).set({ isActive: false }).where(eq(users.id, driverId)).run();
		expect(repo.liveOf(driverId)).toEqual([]);
		db.update(users)
			.set({ isActive: true, deletedAt: new Date() })
			.where(eq(users.id, driverId))
			.run();
		expect(repo.hasLive(driverId)).toBe(false);
	});

	it('removes the own device and answers not found for a device of somebody else', () => {
		service(driver).subscribe(phone);

		expect(() => service(other).unsubscribe(phone.endpoint)).toThrow(NotFoundError);
		expect(service(driver).unsubscribe(phone.endpoint).deviceCount).toBe(0);
	});

	it('serves a portal person the same way', () => {
		const portal = actor(portalId, 'portal', ['cp_employee']);
		expect(service(portal).subscribe(phone).deviceCount).toBe(1);
	});

	it('refuses an actor without a contour right', () => {
		expect(() => service(actor(driverId, 'crm', [])).state()).toThrow(ForbiddenError);
	});

	it('purges expired rows once and leaves live ones', () => {
		service(driver).subscribe(phone);
		service(driver).subscribe(tablet);
		const [first] = repo.liveOf(driverId);
		repo.markExpired(first?.id ?? 0, new Date());

		expect(repo.purgeExpired()).toBe(1);
		expect(repo.purgeExpired()).toBe(0);
		expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
	});

	it('keeps the ten freshest devices of a person and drops the oldest', () => {
		for (let i = 1; i <= 11; i += 1) {
			service(driver).subscribe({ ...phone, endpoint: `https://push.example/sub/${i}` });
		}

		const kept = repo.liveOf(driverId).map((row) => row.endpoint);
		expect(kept).toHaveLength(10);
		expect(kept).not.toContain('https://push.example/sub/1');
		expect(kept).toContain('https://push.example/sub/11');
	});

	it('takes only the hosts of real push services when real pushes are on', () => {
		const strict = new PushSubscriptionService(driver, repo, 'public-key', true);

		expect(() => strict.subscribe(phone)).toThrow(ValidationError);
		expect(() =>
			strict.subscribe({ ...phone, endpoint: 'https://fcm.googleapis.com.evil.example/x' })
		).toThrow(ValidationError);
		for (const endpoint of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://web.push.apple.com/abc',
			'https://updates.push.services.mozilla.com/wpush/v2/abc',
			'https://wns2-par02p.notify.windows.com/w/?token=abc'
		]) {
			expect(strict.subscribe({ ...phone, endpoint }).deviceCount).toBeGreaterThan(0);
		}
	});
});
