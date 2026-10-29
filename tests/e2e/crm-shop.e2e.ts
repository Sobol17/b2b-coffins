import { expect, test, type Page } from '@playwright/test';
import { enterRequest } from './crm-flow';
import { crmNavLink, login, purchaseMoneyKeys } from './fixtures';
import { passStation } from './shop-flow';
import { addToShelf, e2eDb, emptyShelf, shopSync, statusOf } from './transitions';

const ORIGIN = 'http://localhost:4173';
// Wenge is left to this spec: the portal specs order the default walnut, C4 takes black.
const COLOUR = 'Венге';
const db = e2eDb();

/** A request of the manager with nothing on the shelf, accepted into work. */
async function acceptedRequest(page: Page, qty: number): Promise<{ number: string; card: string }> {
	const number = await enterRequest(page, `Орлов Олег ${Date.now()}`, COLOUR, qty);
	const card = new URL(page.url()).pathname;
	emptyShelf(db, number);
	await page.getByRole('button', { name: 'Принять в работу' }).click();
	await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'В работе' })).toBeVisible();
	return { number, card };
}

/** The open visit of the request at the station, as the head sees it. */
async function openVisit(page: Page, number: string, station = 'carpenter'): Promise<string> {
	await page.goto(`/crm/shop?station=${station}&q=${encodeURIComponent(number)}`);
	await page.getByTestId('shop-task').filter({ hasText: number }).click();
	await expect(page.getByTestId('shop-task-number')).toHaveText(number);
	return new URL(page.url()).pathname;
}

async function setUrgent(page: Page, card: string): Promise<void> {
	await page.goto(card);
	const panel = page.locator('form[action="?/priority"]');
	await panel.getByRole('button', { name: 'Приоритет' }).click();
	await page.getByRole('option', { name: 'Срочно', exact: true }).click();
	await panel.getByRole('button', { name: 'Сохранить' }).click();
	await expect(page.getByText('Приоритет изменён')).toBeVisible();
}

test.describe('the stations on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('C19 DoD: the request walks the four stations and reaches the driver', async ({ page }) => {
		await login(page, 'manager');
		const { number } = await acceptedRequest(page, 2);
		await page.context().clearCookies();

		await login(page, 'carpenter');
		await page.goto('/crm/shop');
		const fresh = page.getByTestId('shop-station').getByTestId('shop-task');
		await expect(fresh.filter({ hasText: number })).toContainText('Сделано 0 из 2');
		await fresh.filter({ hasText: number }).click();
		await page.getByRole('button', { name: 'Взять в работу' }).click();
		await expect(page.getByRole('button', { name: 'Взять в работу' })).toHaveCount(0);
		// The visit closes only when every piece is done: one of two keeps «Выполнено» off.
		await page.getByTestId('shop-job').getByLabel('Сделано').fill('1');
		await page.getByRole('button', { name: 'Сохранить' }).click();
		await expect(page.getByTestId('shop-job-count')).toHaveText('Нужно 2 шт · Сделано 1 из 2');
		await expect(page.getByRole('button', { name: 'Выполнено' })).toBeDisabled();
		// The shop floor is a phone screen: the main actions keep the 44 px touch target.
		for (const name of ['Выполнено', 'Сделано всё']) {
			const box = await page.getByRole('button', { name }).boundingBox();
			expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		}
		await passStation(page, number);
		expect(purchaseMoneyKeys(await page.content())).toEqual([]);
		await page.context().clearCookies();

		for (const role of ['grinder', 'painter', 'upholsterer'] as const) {
			await login(page, role);
			await passStation(page, number);
			await page.context().clearCookies();
		}
		expect(statusOf(db, number)).toBe('ready');

		await login(page, 'driver');
		await page.goto('/crm/delivery');
		await expect(page.getByTestId('delivery-stop').filter({ hasText: number })).toBeVisible();
	});
});

test('C19: an urgent request takes the shelf from a normal one in work', async ({ page }) => {
	await login(page, 'manager');
	const normal = await acceptedRequest(page, 2);
	// One piece turns up on the shelf: the normal request takes it, the carpenter makes the other.
	addToShelf(db, normal.number, 1);
	expect(shopSync().ok).toBe(true);
	await page.goto(normal.card);
	await expect(page.getByTestId('line-shop')).toContainText('Со склада 1');
	await expect(page.getByTestId('line-shop')).toContainText('Столяр: сделано 0 из 1');

	const urgent = await acceptedRequest(page, 1);
	expect(statusOf(db, urgent.number)).toBe('in_work');
	await setUrgent(page, urgent.card);

	// The urgent one goes ahead: the piece moves to it and the carpenter makes both of the normal.
	expect(statusOf(db, urgent.number)).toBe('ready');
	expect(statusOf(db, normal.number)).toBe('in_work');
	await page.goto(normal.card);
	await expect(page.getByTestId('line-shop')).toContainText('Столяр: сделано 0 из 2');
	await expect(page.getByTestId('line-shop')).toContainText(urgent.number);
});

test('C19: a station opens only its own visits and the rest get 403', async ({ page }) => {
	await login(page, 'manager');
	const { number } = await acceptedRequest(page, 1);
	const visit = await openVisit(page, number);
	await page.context().clearCookies();

	await login(page, 'grinder');
	expect((await page.goto(visit))?.status()).toBe(403);
	// A forged post skips the missing button: the server fences the station on every action. An
	// action posted as JSON answers HTTP 200 and carries the failure status in the body.
	const forged = await page.request.post(`${visit}?/take`, {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { taskId: visit.split('/').at(-1) ?? '' }
	});
	expect(await forged.json()).toMatchObject({ type: 'failure', status: 403 });
	expect((await page.goto('/crm/shop?station=carpenter'))?.status()).toBe(403);
	await page.context().clearCookies();

	await login(page, 'driver');
	expect((await page.goto('/crm/shop'))?.status()).toBe(403);
	expect((await page.goto(visit))?.status()).toBe(403);
	await page.goto('/crm');
	await expect(crmNavLink(page, 'Цех')).toHaveCount(0);
	await page.context().clearCookies();

	await login(page, 'cp_admin');
	expect((await page.goto('/crm/shop'))?.status()).toBe(403);
});
