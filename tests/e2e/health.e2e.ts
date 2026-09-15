import { expect, test } from '@playwright/test';

test('health endpoint answers on the production bundle', async ({ request }) => {
	const response = await request.get('/api/health');

	expect(response.status()).toBe(200);
	expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('health reports a running worker and the queue counters', async ({ request }) => {
	const body = await (await request.get('/api/health')).json();

	expect(body.queue).toMatchObject({
		workerRunning: true,
		pending: expect.any(Number),
		running: expect.any(Number),
		dead: expect.any(Number)
	});
});

test('security headers are set on every response', async ({ request }) => {
	const response = await request.get('/api/health');
	const headers = response.headers();

	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});
