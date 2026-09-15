import { expect, test, type Page } from '@playwright/test';
import { login } from './fixtures';

const ORIGIN = 'http://localhost:4173';

async function openVolga(page: Page): Promise<string> {
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: 'Модель «Волга»' }).click();
	await expect(page).toHaveURL(/\/portal\/catalog\/product\/\d+$/);
	return new URL(page.url()).pathname;
}

async function addVolga(page: Page, qty: string): Promise<void> {
	await openVolga(page);
	await page.getByLabel('Количество').fill(qty);
	await page.getByTestId('add-to-draft').click();
	await expect(page.getByTestId('cart-count')).toBeVisible();
}

test('an employee builds a request from the catalog and sends it for pickup', async ({ page }) => {
	await login(page, 'cp_employee');
	await addVolga(page, '2');

	await page.getByTestId('cart-chip').click();
	await expect(page).toHaveURL('/portal/cart');
	await expect(
		page.getByTestId('draft-line').filter({ hasText: 'Модель «Волга»' }).first()
	).toBeVisible();
	await expect(page.getByTestId('draft-total')).toHaveText('—');
	const body = await (await page.request.get('/portal/cart/__data.json')).text();
	expect(body).not.toContain('Minor');

	await page.getByText('Самовывоз со склада мастерской').click();
	await page.getByTestId('submit-draft').click();

	await expect(page.getByTestId('request-submitted')).toContainText(/З-\d{4}-\d{5}/);
	await expect(page.getByTestId('cart-count')).toHaveCount(0);
});

test('the administrator sees the personal total with the contract discount', async ({ page }) => {
	await login(page, 'cp_admin');
	await addVolga(page, '1');

	await page.goto('/portal/cart');
	await expect(page.getByTestId('draft-discount')).toContainText('5 %');
	await expect(page.getByTestId('draft-total')).toContainText(',');

	// Leave the seed account without a draft for the next run.
	await page.getByRole('button', { name: 'Очистить' }).click();
	await expect(page.getByText('В заявке пока пусто')).toBeVisible();
});

test('the server refuses an option outside the compatibility matrix', async ({ page }) => {
	await login(page, 'cp_admin');
	const path = await openVolga(page);

	// An action posted as JSON answers HTTP 200 and carries the failure status in the body.
	const response = await page.request.post(`${path}?/add`, {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { variantId: '1', qty: '1', option: '999999' }
	});

	expect(await response.json()).toMatchObject({ type: 'failure', status: 422 });
	await page.reload();
	await expect(page.getByTestId('cart-count')).toHaveCount(0);
});

test('a workshop role gets 403 on the cart page and on its actions', async ({ page }) => {
	await login(page, 'manager');

	expect((await page.goto('/portal/cart'))?.status()).toBe(403);
	const response = await page.request.post('/portal/cart?/submit', {
		headers: { origin: ORIGIN },
		form: { delivery: 'pickup' }
	});
	expect(response.status()).toBe(403);
});
