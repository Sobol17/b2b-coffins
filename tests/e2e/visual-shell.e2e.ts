import { expect, test, type Page } from '@playwright/test';
import { login } from './fixtures';

async function horizontalOverflow(page: Page): Promise<number> {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
}

test.describe('public landing page', () => {
	test('a guest on the root sees the landing page with a way into the portal', async ({ page }) => {
		const response = await page.goto('/');

		expect(response?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('собственного');
		await expect(page.getByRole('link', { name: 'Вход для контрагентов' }).first()).toHaveAttribute(
			'href',
			'/login'
		);
		await expect(page.getByTestId('become-partner')).toHaveAttribute('href', /^tel:\+7\d+$/);
	});

	test('the landing page shows no prices and no catalog data', async ({ page }) => {
		await page.goto('/');

		await expect(page.locator('body')).not.toContainText('₽');
	});

	test('a signed-in user on the root goes to the own contour, not to the landing', async ({
		page
	}) => {
		await login(page, 'manager');
		await page.goto('/');

		await expect(page).toHaveURL('/crm');
	});
});

test.describe('portal shell on a desktop', () => {
	test('shows the header with the current section and the account chip', async ({ page }) => {
		await login(page, 'cp_admin');

		const header = page.getByTestId('portal-header');
		await expect(header).toBeVisible();
		await expect(header.getByRole('link', { name: 'Главная' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByTestId('account-chip')).toHaveAttribute('href', '/portal/profile');
		await expect(page.getByTestId('menu-button')).toBeHidden();
		await expect(header.getByRole('button', { name: 'Выйти' })).toHaveCount(0);
	});

	test('logs out from the side menu of the profile', async ({ page }) => {
		await login(page, 'cp_admin');
		await page.goto('/portal/profile');

		await page.getByTestId('logout').click();
		await expect(page).toHaveURL('/login');
		expect((await page.goto('/portal/profile'))?.url()).toContain('/login');
	});

	test('serves the brand fonts from the app itself', async ({ request }) => {
		const response = await request.get('/fonts/barlow-condensed-600-latin.woff2');

		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('font/woff2');
	});
});

test.describe('portal shell on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('folds the navigation into a drawer and keeps the logout in the profile', async ({
		page
	}) => {
		await login(page, 'cp_employee');

		await expect(page.getByTestId('portal-header').getByRole('navigation')).toBeHidden();
		await page.getByTestId('menu-button').click();

		const drawer = page.getByTestId('drawer');
		await expect(drawer.getByRole('link', { name: 'Главная' })).toBeVisible();
		await expect(drawer.getByRole('button', { name: 'Выйти' })).toHaveCount(0);

		await page.goto('/portal/profile');
		await page.getByTestId('logout').click();
		await expect(page).toHaveURL('/login');
	});

	test('keeps the landing, the portal home and the profile inside the screen width', async ({
		page
	}) => {
		await page.goto('/');
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

		await login(page, 'cp_admin');
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

		await page.goto('/portal/profile');
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
	});
});
