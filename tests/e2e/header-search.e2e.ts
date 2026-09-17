import { expect, test, type Page } from '@playwright/test';
import { login } from './fixtures';

async function openSearch(page: Page, query: string): Promise<void> {
	await page.keyboard.press('ControlOrMeta+k');
	await page.getByPlaceholder('Введите запрос').fill(query);
}

const results = (page: Page) => page.getByTestId('search-results');

test('the administrator finds a model by a lower-case word and opens it', async ({ page }) => {
	await login(page, 'cp_admin');
	await openSearch(page, 'лада');

	await results(page)
		.getByRole('option', { name: /Модель «Лада»/ })
		.click();
	await expect(page).toHaveURL(/\/portal\/catalog\/product\/\d+$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Лада');
});

test('a catalog group and a page open from the keyboard', async ({ page }) => {
	await login(page, 'cp_admin');
	await openSearch(page, 'эконом');
	await expect(results(page).getByRole('option', { name: 'Эконом' })).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/portal\/catalog\/\d+$/);

	await openSearch(page, 'прайс');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL('/portal/prices');
});

test('the employee is not offered the price page and gets no money in the hints', async ({
	page
}) => {
	await login(page, 'cp_employee');
	await openSearch(page, 'цены');
	await expect(results(page)).toContainText('Ничего не найдено');

	const response = await page.request.get('/portal/search?q=модель');
	expect(response.status()).toBe(200);
	const body = await response.text();
	expect(body).not.toMatch(/Minor"/);
	expect(JSON.parse(body)).toMatchObject({ products: expect.any(Array) });
});

test('the hints send a guest to the login and refuse a too short query', async ({
	page,
	request
}) => {
	const guest = await request.get('/portal/search?q=лада', { maxRedirects: 0 });
	expect(guest.status()).toBe(303);
	expect(guest.headers()['location']).toContain('/login');

	await login(page, 'cp_admin');
	expect((await page.request.get('/portal/search?q=л')).status()).toBe(400);
});

test('the hints answer 403 to a workshop role', async ({ page }) => {
	await login(page, 'manager');

	expect((await page.request.get('/portal/search?q=лада')).status()).toBe(403);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 320, height: 640 } });

	test('the magnifier opens the search and the header stays inside the screen', async ({
		page
	}) => {
		await login(page, 'cp_employee');
		const header = page.getByTestId('portal-header');
		expect(await header.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);

		await page.getByTestId('search-button').click();
		await page.getByPlaceholder('Введите запрос').fill('заявки');
		await results(page).getByRole('option', { name: 'Мои заявки' }).click();
		await expect(page).toHaveURL('/portal/requests');

		await page.getByTestId('menu-button').click();
		await expect(page.getByTestId('drawer').getByRole('link', { name: 'Профиль' })).toBeVisible();
	});
});

test('the header keeps its width on a tablet', async ({ page }) => {
	await page.setViewportSize({ width: 768, height: 900 });
	await login(page, 'cp_admin');

	const header = page.getByTestId('portal-header');
	expect(await header.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
});
