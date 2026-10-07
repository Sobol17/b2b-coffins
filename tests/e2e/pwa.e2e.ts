import { expect, test } from '@playwright/test';
import { login, logout } from './fixtures';

interface ManifestIcon {
	src: string;
	sizes: string;
	purpose?: string;
}

test('C15: the manifest is served, valid and points at real icons', async ({ page, request }) => {
	await page.goto('/login');
	// The template writes a relative path; what counts is where the browser resolves it.
	const linked = await page
		.locator('link[rel="manifest"]')
		.evaluate((link) => (link as HTMLLinkElement).href);
	expect(linked).toBe('http://localhost:4173/manifest.webmanifest');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1c2b48');

	const response = await request.get('/manifest.webmanifest');
	expect(response.status()).toBe(200);
	const manifest = (await response.json()) as Record<string, unknown> & { icons: ManifestIcon[] };
	expect(manifest).toMatchObject({
		name: 'Столярная мастерская: заявки',
		short_name: 'Заявки',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		theme_color: '#1c2b48'
	});
	expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`)).toEqual([
		'192x192 any',
		'512x512 any',
		'512x512 maskable'
	]);
	for (const icon of manifest.icons) {
		const image = await request.get(icon.src);
		expect(image.status()).toBe(200);
		expect(image.headers()['content-type']).toBe('image/png');
	}
});

test('C15: the service worker registers and keeps Cache Storage empty', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto('/portal/catalog');
	const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
	expect(scope).toBe('http://localhost:4173/');

	await logout(page);

	expect(await page.evaluate(() => caches.keys())).toEqual([]);
});

test('C15: the worker source has no fetch handler and no cache', async ({ request }) => {
	const source = await (await request.get('/service-worker.js')).text();
	expect(source).toContain('notificationclick');
	expect(source).not.toMatch(/addEventListener\(\s*["'`]fetch/);
	expect(source).not.toMatch(/caches\./);
});
