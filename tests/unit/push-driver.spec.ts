import { beforeEach, describe, expect, it } from 'vitest';
import { FakePushDriver } from '../../src/lib/server/notifications/drivers/push';

const target = { endpoint: 'https://push.example/sub/1', p256dh: 'key', auth: 'secret' };
const message = {
	title: 'Заявка 2026-0042',
	body: 'Готова к выдаче',
	url: '/crm/delivery',
	tag: 'r42'
};

describe('fake push driver', () => {
	const driver = new FakePushDriver();

	beforeEach(() => driver.reset());

	it('records a valid push', async () => {
		await driver.send(target, message);

		expect(driver.sent).toEqual([{ target, message }]);
	});

	it('fails on a message with fields outside tech.md 17.2', async () => {
		const leaky = { ...message, totalMinor: 1500000 } as typeof message;

		await expect(driver.send(target, leaky)).rejects.toThrow('invalid');
		expect(driver.sent).toHaveLength(0);
	});

	it('fails on a link that leaves the app', async () => {
		await expect(
			driver.send(target, { ...message, url: 'https://evil.example' })
		).rejects.toThrow();
		await expect(driver.send(target, { ...message, url: '//evil.example' })).rejects.toThrow();
	});

	it('fails on a plain http endpoint', async () => {
		await expect(
			driver.send({ ...target, endpoint: 'http://push.example/sub/1' }, message)
		).rejects.toThrow();
	});

	it('fails once on request and then delivers', async () => {
		driver.failOnce();

		await expect(driver.send(target, message)).rejects.toThrow('failure');
		await driver.send(target, message);

		expect(driver.sent).toHaveLength(1);
	});

	it('hangs once on request without recording the push', async () => {
		driver.hangOnce();

		const outcome = await Promise.race([
			driver.send(target, message).then(() => 'settled'),
			new Promise((resolve) => setTimeout(() => resolve('timeout'), 20))
		]);

		expect(outcome).toBe('timeout');
		expect(driver.sent).toHaveLength(0);
	});
});
