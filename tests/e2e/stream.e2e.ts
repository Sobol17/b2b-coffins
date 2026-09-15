import { expect, test, type Page } from '@playwright/test';
import { login } from './fixtures';

/** Opens an EventSource in the page and resolves with the first message the server pushes. */
function firstMessage(page: Page, path: string): Promise<unknown> {
	return page.evaluate(
		(url) =>
			new Promise<unknown>((resolve, reject) => {
				const source = new EventSource(url);
				source.onmessage = (event) => {
					source.close();
					resolve(JSON.parse(event.data as string));
				};
				source.onerror = () => {
					source.close();
					reject(new Error(`stream ${url} failed`));
				};
			}),
		path
	);
}

test('the public charity stream delivers an event to the browser', async ({ page }) => {
	await page.goto('/login');

	const message = await firstMessage(page, '/api/stream/charity');

	expect(message).toMatchObject({
		topic: 'charity',
		totalMinor: expect.any(Number),
		yearMinor: expect.any(Number),
		requestCount: expect.any(Number)
	});
});

test('a manager receives request counters on the CRM stream', async ({ page }) => {
	await login(page, 'manager');

	const message = await firstMessage(page, '/api/stream/requests');

	expect(message).toMatchObject({ topic: 'requests', byStatus: { new: expect.any(Number) } });
});

test('the CRM stream answers 403 to a portal role and to a guest', async ({ page, request }) => {
	await login(page, 'cp_admin');
	expect((await page.request.get('/api/stream/requests')).status()).toBe(403);

	expect((await request.get('/api/stream/requests')).status()).toBe(403);
});

test('an unknown stream topic answers 404', async ({ request }) => {
	expect((await request.get('/api/stream/payroll')).status()).toBe(404);
});
