import { expect, test } from '@playwright/test';

test('health endpoint answers on the production bundle', async ({ request }) => {
	const response = await request.get('/api/health');

	expect(response.status()).toBe(200);
	expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('security headers are set on every response', async ({ request }) => {
	const response = await request.get('/api/health');
	const headers = response.headers();

	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});
