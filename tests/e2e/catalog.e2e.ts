import { expect, test, type Page } from '@playwright/test';
import { login, purchaseMoneyKeys } from './fixtures';

async function openVolga(page: Page): Promise<string> {
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: 'Модель «Волга»' }).click();
	await expect(page).toHaveURL(/\/portal\/catalog\/product\/\d+$/);
	return new URL(page.url()).pathname;
}

test('an administrator sees the groups with prices and downloads the personal price list', async ({
	page
}) => {
	await login(page, 'cp_admin');
	await page.goto('/portal/catalog');

	await expect(page.getByTestId('category-group')).toHaveCount(3);
	await expect(page.getByTestId('category-group').first()).toContainText('от');
	await expect(page.getByTestId('price-list-download')).toBeVisible();

	const response = await page.request.get('/portal/catalog/price-list.xlsx');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('spreadsheetml');
	// An XLSX file is a zip archive: it starts with the PK signature.
	expect((await response.body()).subarray(0, 2).toString()).toBe('PK');
});

test('the stock filter narrows a listing and stays in the url', async ({ page }) => {
	await login(page, 'cp_employee');
	await page.goto('/portal/catalog');
	await page
		.getByTestId('category-group')
		.first()
		.getByRole('link', { name: 'Все модели группы' })
		.click();
	await expect(page).toHaveURL(/\/portal\/catalog\/\d+/);
	const before = await page.getByTestId('product-card').count();

	await page.getByTestId('catalog-filters').getByText('Есть на складе').click();
	await page.getByTestId('catalog-filters').getByRole('button', { name: 'Применить' }).click();

	await expect(page).toHaveURL(/inStock=1/);
	await expect(page.getByTestId('selected-filters')).toContainText('Есть на складе');
	const cards = page.getByTestId('product-card');
	expect(await cards.count()).toBeLessThan(before);
	for (const stock of await page.getByTestId('product-stock').allTextContents()) {
		expect(stock).toContain('На складе');
	}
});

test('the product page quotes the personal price to the administrator', async ({ page }) => {
	await login(page, 'cp_admin');
	await openVolga(page);

	// Partner price list of the seed: MDL-201-180-PIN costs 8 300 ₽ instead of the base 8 900 ₽.
	await expect(page.getByTestId('product-page-price')).toContainText('8 300,00');
	await expect(page.getByTestId('product-page-stock')).toContainText('12 шт');
});

test('the product page asks for the size and the colour only', async ({ page }) => {
	await login(page, 'cp_employee');
	await openVolga(page);

	const form = page.locator('form[action="?/add"]');
	await expect(form.locator('label')).toHaveText(['Размер', 'Цвет', 'Количество']);
	await expect(form.locator('input[name="option"]')).toHaveCount(1);
});

test('the employee sees the same product with a dash and no money in the server answer', async ({
	page
}) => {
	await login(page, 'cp_employee');
	const path = await openVolga(page);

	await expect(page.getByTestId('product-page-price')).toHaveText('—');
	const body = await (await page.request.get(`${path}/__data.json`)).text();
	expect(purchaseMoneyKeys(body)).toEqual([]);
	expect(body).not.toContain('830000');
});

test('the price list answers 403 to the employee and the storefront 403 to the workshop', async ({
	page
}) => {
	await login(page, 'cp_employee');
	await page.goto('/portal/catalog');
	await expect(page.getByTestId('price-list-download')).toHaveCount(0);
	expect((await page.request.get('/portal/catalog/price-list.xlsx')).status()).toBe(403);
	await page.click('button:has-text("Выйти")');

	await login(page, 'manager');
	expect((await page.goto('/portal/catalog'))?.status()).toBe(403);
});

test('an unknown category or product answers 404', async ({ page }) => {
	await login(page, 'cp_employee');

	expect((await page.goto('/portal/catalog/999999'))?.status()).toBe(404);
	expect((await page.goto('/portal/catalog/not-a-number'))?.status()).toBe(404);
	expect((await page.goto('/portal/catalog/product/999999'))?.status()).toBe(404);
});

test.describe('the storefront on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('keeps the catalog, a listing and a product inside the screen width', async ({ page }) => {
		await login(page, 'cp_admin');
		const overflow = () =>
			page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);

		await page.goto('/portal/catalog');
		expect(await overflow()).toBeLessThanOrEqual(0);

		await page
			.getByTestId('category-group')
			.first()
			.getByRole('link', { name: 'Все модели группы' })
			.click();
		await expect(page).toHaveURL(/\/portal\/catalog\/\d+/);
		expect(await overflow()).toBeLessThanOrEqual(0);

		await openVolga(page);
		expect(await overflow()).toBeLessThanOrEqual(0);
	});
});

test('the files route answers 403 to a guest and 404 for an unknown photo', async ({
	page,
	request
}) => {
	expect((await request.get('/api/files/1')).status()).toBe(403);

	await login(page, 'cp_employee');
	expect((await page.request.get('/api/files/999999')).status()).toBe(404);
	expect((await page.request.get('/api/files/not-a-number')).status()).toBe(404);
});
