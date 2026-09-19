import { expect, test, type Page } from '@playwright/test';
import { login, purchaseMoneyKeys } from './fixtures';
import { emptyCart, fillDelivery } from './portal-flow';

const ORIGIN = 'http://localhost:4173';

async function openVolga(page: Page): Promise<string> {
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: 'Модель «Волга»' }).click();
	await expect(page).toHaveURL(/\/portal\/catalog\/product\/\d+$/);
	return new URL(page.url()).pathname;
}

async function addVolga(page: Page, qty: string): Promise<void> {
	await emptyCart(page);
	await openVolga(page);
	await page.getByLabel('Количество').fill(qty);
	await page.getByTestId('add-to-draft').click();
	await expect(page.getByTestId('cart-count')).toBeVisible();
}

test('an employee builds a request from the catalog and sends it', async ({ page }) => {
	await login(page, 'cp_employee');
	await addVolga(page, '2');

	await page.getByTestId('cart-chip').click();
	await expect(page).toHaveURL('/portal/cart');
	await expect(
		page.getByTestId('draft-line').filter({ hasText: 'Модель «Волга»' }).first()
	).toBeVisible();
	await expect(page.getByTestId('draft-total')).toHaveText('—');
	const body = await (await page.request.get('/portal/cart/__data.json')).text();
	expect(purchaseMoneyKeys(body)).toEqual([]);

	await fillDelivery(page);
	await page.getByTestId('submit-draft').click();

	await expect(page.getByTestId('request-submitted')).toContainText(/З-\d{4}-\d{5}/);
	await expect(page.getByTestId('cart-count')).toHaveCount(0);
});

test('the server refuses a send while the delivery fields are empty', async ({ page }) => {
	await login(page, 'cp_employee');
	await addVolga(page, '1');

	// The markup marks the fields required, and markup is not a defence: the check that counts is
	// posted straight to the action, the way a forged request would arrive.
	const response = await page.request.post('/portal/cart?/submit', {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { deliveryAddressId: '', deliveryDate: '', deliveryTime: '', deceasedName: '' }
	});

	expect(await response.json()).toMatchObject({ type: 'failure' });
	await page.goto('/portal/cart');
	// The draft is untouched: a refused send leaves the cart exactly as it was.
	await expect(page.getByTestId('cart-count')).toBeVisible();
	await expect(page.getByTestId('draft-line').first()).toBeVisible();
});

test('the administrator sees the personal total with the contract discount', async ({ page }) => {
	await login(page, 'cp_admin');
	await addVolga(page, '1');

	await page.goto('/portal/cart');
	await expect(page.getByTestId('draft-discount')).toContainText('5 %');
	// Whole rubles on screen (v1.32): a digit is there, a kopeck separator is not.
	await expect(page.getByTestId('draft-total')).toContainText(/\d/);
	await expect(page.getByTestId('draft-total')).not.toContainText(',');
});

test('the server refuses an option outside the compatibility matrix', async ({ page }) => {
	await login(page, 'cp_admin');
	await emptyCart(page);
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
		form: { deliveryAddressId: '', deliveryDate: '', deliveryTime: '', deceasedName: '' }
	});
	expect(response.status()).toBe(403);
});

test('the product page turns the add button into a counter once the size is in the draft', async ({
	page
}) => {
	await login(page, 'cp_admin');
	await addVolga(page, '1');

	const counter = page.getByTestId('draft-line-counter');
	await expect(counter.getByTestId('counter-qty')).toHaveText('1');
	await expect(page.getByTestId('add-to-draft')).toHaveCount(0);

	await counter.getByTestId('counter-plus').click();
	await expect(counter.getByTestId('counter-qty')).toHaveText('2');
	await expect(page.getByTestId('cart-count')).toHaveText('2');

	await counter.getByTestId('counter-minus').click();
	await expect(counter.getByTestId('counter-qty')).toHaveText('1');
	// Below one piece the line leaves the draft and the page offers to add it again.
	await counter.getByTestId('counter-minus').click();
	await expect(page.getByTestId('add-to-draft')).toBeVisible();
	await expect(page.getByTestId('draft-line-counter')).toHaveCount(0);
	await expect(page.getByTestId('cart-count')).toHaveCount(0);
});

test('a workshop role gets 403 on the counter actions of the product page', async ({ page }) => {
	await login(page, 'manager');

	for (const action of ['qty', 'remove']) {
		const response = await page.request.post(`/portal/catalog/product/1?/${action}`, {
			headers: { origin: ORIGIN },
			form: { itemId: '1', qty: '2' }
		});
		expect(response.status()).toBe(403);
	}
});
