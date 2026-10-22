import { expect, test, type Page } from '@playwright/test';
import { login, loginAs, logout, OTHER_COUNTERPARTY_ADMIN } from './fixtures';

const ORIGIN = 'http://localhost:4173';
// Other specs add counterparties to the e2e database, so the seeded one is found by its INN.
const COUNTERPARTY_INN = '500100200300';
// The seed puts «Память» on the base list: MDL-201-180-PIN costs it the variant price, 8 900 ₽.
const BASE_SHOWN = /8\u00a0900(?![,\d])/;
const OWN_RUBLES = '7 777';
const OWN_SHOWN = /7\u00a0777(?![,\d])/;

async function openPrices(page: Page): Promise<void> {
	await page.goto(`/crm/counterparties?search=${COUNTERPARTY_INN}`);
	const href = await page
		.getByTestId('data-table-row')
		.filter({ hasText: `ИНН ${COUNTERPARTY_INN}` })
		.getByRole('link')
		.first()
		.getAttribute('href');
	// The search sits in the query string, so the tab opens with the one model in view.
	await page.goto(`${href}?priceSearch=MDL-201-180`);
	await expect(page.getByRole('tab', { name: 'Цены' })).toHaveAttribute('aria-selected', 'true');
}

function priceField(page: Page) {
	return page
		.getByTestId('data-table-row')
		.filter({ hasText: 'MDL-201-180-PIN' })
		.getByTestId('personal-price-input')
		.locator('input[type="text"]');
}

async function portalPrice(page: Page): Promise<void> {
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: 'Модель «Волга»' }).click();
	await expect(page).toHaveURL(/\/portal\/catalog\/product\/\d+$/);
}

test('the manager sets an individual price and the counterparty is quoted by it', async ({
	page
}) => {
	await login(page, 'manager');
	await openPrices(page);
	await priceField(page).fill(OWN_RUBLES);
	await page.getByRole('button', { name: 'Сохранить цены' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Цены сохранены' })).toBeVisible();
	await expect(priceField(page)).toHaveValue(OWN_SHOWN);
	await logout(page);

	await loginAs(page, OTHER_COUNTERPARTY_ADMIN);
	await portalPrice(page);
	await expect(page.getByTestId('product-page-price')).toContainText(OWN_SHOWN);
	await logout(page);

	// An emptied field gives the counterparty the base price back, and the next run starts clean.
	await login(page, 'manager');
	await openPrices(page);
	await priceField(page).fill('');
	await page.getByRole('button', { name: 'Сохранить цены' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Очищено: 1' })).toBeVisible();
	await expect(priceField(page)).toHaveValue('');
	await logout(page);

	await loginAs(page, OTHER_COUNTERPARTY_ADMIN);
	await portalPrice(page);
	await expect(page.getByTestId('product-page-price')).toContainText(BASE_SHOWN);
});

test('a driver gets 403 on the card and on the price action', async ({ page }) => {
	await login(page, 'driver');
	expect((await page.goto('/crm/counterparties/1'))?.status()).toBe(403);
	const response = await page.request.post('/crm/counterparties/1?/prices', {
		headers: { origin: ORIGIN },
		form: { 'price:1': '100000' }
	});
	expect(response.status()).toBe(403);
});
