import { expect, test, type Page } from '@playwright/test';
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

/** The browser decides when to offer an install; the test plays its part with the same event. */
async function offerInstall(page: Page): Promise<void> {
	await expect(async () => {
		await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
		await expect(page.getByTestId('install-banner')).toBeVisible({ timeout: 1000 });
	}).toPass();
}

for (const { role, home, next } of [
	{ role: 'cp_employee', home: '/portal', next: '/portal/catalog' },
	{ role: 'driver', home: '/crm', next: '/crm/delivery' }
] as const) {
	test(`install banner: ${role} sees the offer on every screen until it is closed`, async ({
		page
	}) => {
		await login(page, role);
		await expect(page.getByTestId('install-banner')).toHaveCount(0);

		await offerInstall(page);
		const banner = page.getByTestId('install-banner');
		await expect(banner.getByRole('button', { name: 'Установить' })).toBeVisible();
		// The bar sits above the header: nothing of the page is drawn over it.
		expect((await banner.boundingBox())?.y).toBe(0);
		await page.goto(next);
		await offerInstall(page);

		const close = page.getByRole('button', { name: 'Скрыть предложение установки' });
		expect((await close.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
		await close.click();
		await expect(banner).toHaveCount(0);

		// The cross is remembered on the device: a new offer of the browser does not bring it back.
		await page.goto(home);
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
		await expect(banner).toHaveCount(0);
	});
}

test.describe('install banner on an iPhone', () => {
	test.use({
		userAgent:
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
		viewport: { width: 390, height: 844 }
	});

	test('Safari has no install event, so the bar names the two taps', async ({ page }) => {
		await login(page, 'driver');

		const banner = page.getByTestId('install-banner');
		await expect(banner).toContainText('«Поделиться», затем «На экран Домой»');
		await expect(banner.getByRole('button', { name: 'Установить' })).toHaveCount(0);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
