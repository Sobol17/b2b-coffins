import { expect, test, type Page } from '@playwright/test';
import { login, purchaseMoneyKeys } from './fixtures';

const ORIGIN = 'http://localhost:4173';
const MODEL = 'Модель «Канцлер»';
const PRICE_RUBLES = '154 300';
// The app groups thousands with a no-break space, the same character `formatMinor` writes.
const PRICE_SHOWN = '154\u00a0300,00';

async function openModel(page: Page, title: string): Promise<string> {
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: title }).click();
	await expect(page).toHaveURL(/\/portal\/catalog\/product\/\d+$/);
	return new URL(page.url()).pathname;
}

test('the administrator sets an agency price and the employee sells by it', async ({ page }) => {
	await login(page, 'cp_admin');
	// The search comes from the query string, the same way the page reads it in a load.
	await page.goto('/portal/prices?search=Канцлер');

	const row = page.getByTestId('data-table-row').filter({ hasText: MODEL });
	await expect(row).toHaveCount(1);
	// The purchase price stays next to the field, so the markup is set with both numbers in view.
	await expect(row.locator('[data-slot="price-cell"]').first()).not.toHaveText('—');

	await row.getByTestId('agency-price-input').locator('input[type="text"]').fill(PRICE_RUBLES);
	await page.getByRole('button', { name: 'Сохранить цены' }).click();
	await expect(page.getByTestId('prices-saved')).toBeVisible();
	await expect(row.getByTestId('agency-price-input').locator('input[type="text"]')).toHaveValue(
		PRICE_SHOWN
	);

	await page.click('button:has-text("Выйти")');
	await login(page, 'cp_employee');
	const path = await openModel(page, MODEL);
	await expect(page.getByTestId('product-page-price')).toContainText(PRICE_SHOWN);

	const body = await (await page.request.get(`${path}/__data.json`)).text();
	expect(body).toContain('agencyPriceMinor');
	expect(purchaseMoneyKeys(body)).toEqual([]);
});

test('the employee gets 403 on the prices page and on its action, and no menu entry', async ({
	page
}) => {
	await login(page, 'cp_employee');

	expect((await page.goto('/portal/prices'))?.status()).toBe(403);

	const response = await page.request.post('/portal/prices?/save', {
		headers: { origin: ORIGIN },
		form: { 'price:1': '100000' }
	});
	expect(response.status()).toBe(403);

	await page.goto('/portal/profile');
	await expect(page.getByRole('link', { name: 'Мои цены' })).toHaveCount(0);
});
