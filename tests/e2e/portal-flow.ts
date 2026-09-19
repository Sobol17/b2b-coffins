import { expect, type Page } from '@playwright/test';
import { login } from './fixtures';

/** The portal side of P4: a sent request is what every later slice starts from. */
export async function sendRequest(page: Page, role: 'cp_admin' | 'cp_employee'): Promise<string> {
	await login(page, role);
	return submitRequest(page);
}

/**
 * The e2e database is never wiped, so a draft left by an earlier spec turns the add button into a
 * counter and the next one fails on an unrelated line. Every flow starts from an empty cart.
 */
export async function emptyCart(page: Page): Promise<void> {
	await page.goto('/portal/cart');
	const clear = page.getByRole('button', { name: 'Очистить' });
	if (await clear.isVisible()) await clear.click();
	await expect(page.getByText('В заявке пока пусто')).toBeVisible();
}

/**
 * Address, deadline and the deceased: since v1.33 the server refuses a send without all three.
 * The date lands through the calendar popover, the way a person fills it.
 */
export async function fillDelivery(page: Page): Promise<void> {
	await page.getByTestId('delivery-address').locator('[data-slot="select-trigger"]').click();
	await page.getByRole('option').first().click();
	await page.getByTestId('delivery-date').getByRole('button').click();
	await expect(page.getByRole('grid')).toBeVisible();
	await page.locator('[data-bits-day]:not([data-disabled])').first().click();
	await page.getByLabel('Время доставки').fill('10:00');
	await page.getByLabel('ФИО умершего').fill('Иванов Иван Иванович');
}

/** One more request from the account the page is already signed in with. */
export async function submitRequest(page: Page): Promise<string> {
	await emptyCart(page);
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: 'Модель «Волга»' }).click();
	await page.getByLabel('Количество').fill('1');
	await page.getByTestId('add-to-draft').click();

	await page.goto('/portal/cart');
	await fillDelivery(page);
	await page.getByTestId('submit-draft').click();

	const banner = page.getByTestId('request-submitted');
	await expect(banner).toContainText(/З-\d{4}-\d{5}/);
	const number = (await banner.innerText()).match(/З-\d{4}-\d{5}/)?.[0];
	if (!number) throw new Error('the portal did not show a request number');
	return number;
}

export async function openCard(page: Page, number: string): Promise<void> {
	await page.goto('/portal/requests');
	await page.getByTestId('request-row').filter({ hasText: number }).getByText('Открыть').click();
	await expect(page.getByTestId('request-number')).toContainText(number);
}
