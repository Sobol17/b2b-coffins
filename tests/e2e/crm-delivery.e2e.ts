import { expect, test, type Page } from '@playwright/test';
import { enterRequest } from './crm-flow';
import { login } from './fixtures';
import { e2eDb, statusChain, statusOf, stockUp, transition } from './transitions';

const ORIGIN = 'http://localhost:4173';
// White is left to this spec: the portal orders walnut, C4 takes black, C5 wenge.
const COLOUR = 'Белый';
const db = e2eDb();

/** A manager's request made and assembled: it waits on the shelf for the driver. */
async function assembledRequest(page: Page, qty: number): Promise<{ number: string; id: string }> {
	await login(page, 'manager');
	const number = await enterRequest(page, `Соколов Семён ${Date.now()}`, COLOUR, qty);
	const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
	await page.context().clearCookies();
	return { number, id };
}

function stopOf(page: Page, number: string) {
	return page.getByTestId('delivery-stop').filter({ hasText: number });
}

async function load(page: Page, number: string, qty: number): Promise<void> {
	const stop = stopOf(page, number);
	await stop.getByLabel('Штук').fill(String(qty));
	await stop.getByRole('button', { name: 'Погрузил' }).click();
	await expect(page.getByText('Погрузка отмечена').first()).toBeVisible();
}

test.describe('the delivery screen on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('C6 DoD: the driver loads, takes the cash and closes the request in paid', async ({
		page
	}) => {
		const { number } = await assembledRequest(page, 2);
		await login(page, 'driver');

		await page.getByRole('link', { name: 'Доставка' }).first().click();
		const stop = stopOf(page, number);
		await expect(stop.getByTestId('delivery-loaded')).toHaveText('Погружено 0 из 2');
		await expect(stop.getByTestId('delivery-route')).toHaveAttribute('href', /yandex\.ru\/maps/);
		await expect(stop.getByTestId('delivery-sum')).toContainText('Сумма заявки');
		await expect(stop.getByRole('button', { name: 'Доставлено' })).toHaveCount(0);

		await load(page, number, 1);
		await expect(stop.getByTestId('delivery-loaded')).toHaveText('Погружено 1 из 2');
		await load(page, number, 1);
		await expect(stop.getByTestId('delivery-loaded')).toHaveText('Погружено 2 из 2');

		// The driver works with one hand on a phone: the main action keeps the 44 px touch target.
		const done = stop.getByRole('button', { name: 'Доставлено' });
		expect((await done.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
		await stop.getByLabel('Принял оплату наличными').check();
		await done.click();

		await expect(page.getByText('Заявка доставлена').first()).toBeVisible();
		await expect(stopOf(page, number)).toHaveCount(0);
		expect(statusOf(db, number)).toBe('paid');
		expect(statusChain(db, number).slice(-3)).toEqual([
			'ready->delivered',
			'delivered->awaiting_payment',
			'awaiting_payment->paid'
		]);
	});

	test('C6: a delivery without cash waits in awaiting_payment', async ({ page }) => {
		const { number } = await assembledRequest(page, 1);
		await login(page, 'driver');
		await page.goto('/crm/delivery');

		await load(page, number, 1);
		await stopOf(page, number).getByRole('button', { name: 'Доставлено' }).click();

		await expect(page.getByText('Заявка доставлена').first()).toBeVisible();
		expect(statusOf(db, number)).toBe('awaiting_payment');
	});
});

test('C6: «Снять» puts the loaded pieces back', async ({ page }) => {
	const { number } = await assembledRequest(page, 2);
	await login(page, 'driver');
	await page.goto('/crm/delivery');

	await load(page, number, 2);
	await stopOf(page, number).getByRole('button', { name: 'Снять' }).click();

	await expect(page.getByText('Погрузка снята').first()).toBeVisible();
	await expect(stopOf(page, number).getByTestId('delivery-loaded')).toHaveText('Погружено 0 из 2');
	expect(statusOf(db, number)).toBe('ready');
});

test('C6: the server refuses to deliver a request not loaded in full', async ({ page }) => {
	const { number, id } = await assembledRequest(page, 1);
	await login(page, 'driver');

	// A forged post skips the hidden button: guard fullyLoaded of tech.md 6.2 still says no.
	const forged = await page.request.post('/crm/delivery?/deliver', {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { requestId: id, cashCollected: 'on' }
	});

	expect(await forged.json()).toMatchObject({ type: 'failure', status: 409 });
	expect(statusOf(db, number)).toBe('ready');
});

test('C6: the shop crew and the portal get 403, the driver still has no board', async ({
	page
}) => {
	await login(page, 'carpenter');
	expect((await page.goto('/crm/delivery'))?.status()).toBe(403);
	const forged = await page.request.post('/crm/delivery?/load', {
		headers: { origin: ORIGIN },
		form: { itemId: '1', qty: '1' }
	});
	expect(forged.status()).toBe(403);
	await page.goto('/crm');
	await expect(page.getByRole('link', { name: 'Доставка' })).toHaveCount(0);
	await page.context().clearCookies();

	await login(page, 'cp_admin');
	expect((await page.goto('/crm/delivery'))?.status()).toBe(403);
	await page.context().clearCookies();

	await login(page, 'driver');
	expect((await page.goto('/crm/board'))?.status()).toBe(403);
});
