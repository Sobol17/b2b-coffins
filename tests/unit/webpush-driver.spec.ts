import { describe, expect, it } from 'vitest';
import { WebPushError } from 'web-push';
import { parseConfig } from '../../src/lib/server/config';
import { FakePushDriver, PushGoneError } from '../../src/lib/server/notifications/drivers/push';
import { createPushDriver } from '../../src/lib/server/notifications/drivers/push/select';
import {
	PUSH_TIMEOUT_MS,
	PUSH_TTL_SECONDS,
	WebPushDriver,
	type PushTransport
} from '../../src/lib/server/notifications/drivers/push/webpush';

const base = { SESSION_SECRET: 'unit-session-secret-value-at-least-32-chars' };
const vapid = { subject: 'mailto:owner@example.ru', publicKey: 'pub', privateKey: 'priv' };
const target = { endpoint: 'https://push.example/sub/1', p256dh: 'key', auth: 'secret' };
const message = { title: 'Заявка 2026-0042', body: 'Готова', url: '/crm/delivery', tag: 'r:42' };

function answering(statusCode: number): PushTransport {
	return () => Promise.reject(new WebPushError('refused', statusCode, {}, '', target.endpoint));
}

describe('web push driver (C15)', () => {
	it('sends the message as JSON with the TTL, the urgency and the timeout of the plan', async () => {
		const calls: Parameters<PushTransport>[] = [];
		const driver = new WebPushDriver(vapid, (...args) => {
			calls.push(args);
			return Promise.resolve();
		});

		await driver.send(target, message);

		const [subscription, payload, options] = calls[0] ?? [];
		expect(subscription).toEqual({
			endpoint: target.endpoint,
			keys: { p256dh: 'key', auth: 'secret' }
		});
		expect(JSON.parse(String(payload))).toEqual(message);
		expect(options).toEqual({
			vapidDetails: vapid,
			TTL: PUSH_TTL_SECONDS,
			urgency: 'high',
			timeout: PUSH_TIMEOUT_MS
		});
		expect(PUSH_TTL_SECONDS).toBe(14_400);
	});

	it('reports a subscription the push service no longer knows', async () => {
		for (const status of [404, 410]) {
			const gone = new WebPushDriver(vapid, answering(status)).send(target, message);
			await expect(gone).rejects.toBeInstanceOf(PushGoneError);
		}
	});

	it('passes any other refusal on for a retry', async () => {
		const failure = new WebPushDriver(vapid, answering(503)).send(target, message);
		await expect(failure).rejects.toBeInstanceOf(WebPushError);
	});
});

describe('push driver selection (C15)', () => {
	const keys = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };

	it('keeps the fake unless the config asks for web push', () => {
		expect(createPushDriver(parseConfig(base))).toBeInstanceOf(FakePushDriver);
	});

	it('builds the real driver from the VAPID keys', () => {
		const env = parseConfig({
			...base,
			...keys,
			PUSH_DRIVER: 'webpush',
			VAPID_SUBJECT: 'mailto:owner@example.ru'
		});
		expect(createPushDriver(env)).toBeInstanceOf(WebPushDriver);
	});

	it('refuses to boot real push without VAPID keys or a contact', () => {
		const env = { ...base, PUSH_DRIVER: 'webpush' };
		expect(() => parseConfig(env)).toThrow(/VAPID_PUBLIC_KEY.*VAPID_PRIVATE_KEY/);
		expect(() => parseConfig({ ...env, ...keys })).toThrow(/VAPID_SUBJECT/);
	});
});
