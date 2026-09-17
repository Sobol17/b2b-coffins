import { expect, test, type Page } from '@playwright/test';
import { login, logout, purchaseMoneyKeys } from './fixtures';
import { sendRequest, submitRequest } from './portal-flow';
import { assignCrew, e2eDb, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const SETTINGS = '/portal/profile/notifications';
const QUEUE_TIMEOUT = 15_000;

function toReady(number: string): void {
	assignCrew(db, number, 'carpenter', 'carpenter');
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	expect(transition(number, 'ready', 'carpenter').ok).toBe(true);
}

/** The worker sends in the background, so the log is read again until the row turns up sent. */
async function expectSentInLog(page: Page, number: string, event: string): Promise<void> {
	await expect(async () => {
		await page.goto(SETTINGS);
		const row = page
			.getByTestId('data-table-row')
			.filter({ hasText: number })
			.filter({ hasText: event });
		await expect(row.getByTestId('delivery-status')).toHaveText('Отправлено', { timeout: 500 });
	}).toPass({ timeout: QUEUE_TIMEOUT });
}

async function signOut(page: Page): Promise<void> {
	await logout(page);
}

test('the author and the administrator get a letter when the request is ready', async ({
	page
}) => {
	const number = await sendRequest(page, 'cp_employee');
	toReady(number);

	await expectSentInLog(page, number, 'Заявка готова к выдаче');
	const link = page
		.getByTestId('data-table-row')
		.filter({ hasText: number })
		.getByRole('link', { name: number });
	await expect(link).toHaveAttribute('href', /\/portal\/requests\/\d+$/);

	await signOut(page);
	await login(page, 'cp_admin');
	await expectSentInLog(page, number, 'Заявка готова к выдаче');
});

test('an employee hears nothing about a request someone else wrote', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');
	toReady(number);
	await expectSentInLog(page, number, 'Заявка готова к выдаче');

	await signOut(page);
	await login(page, 'cp_employee');
	await page.goto(SETTINGS);
	await expect(page.getByTestId('data-table-row').filter({ hasText: number })).toHaveCount(0);
});

test('a switched-off event stops the letters and the choice survives a reload', async ({
	page
}) => {
	await login(page, 'cp_admin');
	await page.goto(SETTINGS);
	const ready = page.getByRole('checkbox', { name: 'Заявка готова к выдаче: почта' });
	await expect(ready).toBeChecked();

	await ready.click();
	await page.getByTestId('save-notifications').click();
	const toast = page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' });
	await expect(toast).toBeVisible();
	await expect(toast.getByTestId('toast-description')).toHaveText('Писем включено: 5 из 6');

	await page.reload();
	await expect(ready).not.toBeChecked();

	const number = await submitRequest(page);
	toReady(number);
	// Delivery is the next event; its letter proves the queue ran past the silenced one.
	assignCrew(db, number, 'driver', 'driver');
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);
	await expectSentInLog(page, number, 'Заявка доставлена');
	await expect(
		page
			.getByTestId('data-table-row')
			.filter({ hasText: number })
			.filter({ hasText: 'готова к выдаче' })
	).toHaveCount(0);

	await ready.check();
	await page.getByTestId('save-notifications').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' })).toBeVisible();
});

test('turning every letter off warns where the status still shows', async ({ page }) => {
	await login(page, 'cp_employee');
	await page.goto(SETTINGS);
	const boxes = page.getByRole('checkbox');
	for (const box of await boxes.all()) await box.uncheck();
	await page.getByTestId('save-notifications').click();

	const toast = page.getByTestId('toast').filter({ hasText: 'Письма отключены' });
	await expect(toast).toHaveAttribute('data-kind', 'warning');
	await expect(toast).toContainText('«Мои заявки»');

	for (const box of await boxes.all()) await box.check();
	await page.getByTestId('save-notifications').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' })).toBeVisible();
});

test('the employee cannot switch on an event its role is not offered', async ({ page }) => {
	await login(page, 'cp_employee');
	await page.goto(SETTINGS);
	await expect(page.getByTestId('notification-pref')).toHaveCount(4);
	await expect(page.getByRole('checkbox', { name: /оплачена/ })).toHaveCount(0);

	// A crafted switch the page never offered: the server refuses it and says so in a toast.
	await page.evaluate(() => {
		const input = Object.assign(document.createElement('input'), {
			type: 'hidden',
			name: 'enabled',
			value: 'request.paid:email'
		});
		document.querySelector('form[action="?/save"]')?.append(input);
	});
	await page.getByTestId('save-notifications').click();
	const toast = page.getByTestId('toast').filter({ hasText: 'Такой настройки уведомлений нет' });
	await expect(toast).toHaveAttribute('data-kind', 'error');
});

test('the settings page carries no purchase money for the employee', async ({ page }) => {
	await login(page, 'cp_employee');
	const body = await (await page.request.get(`${SETTINGS}/__data.json`)).text();

	expect(body).toContain('employee@ritual-service.example');
	expect(purchaseMoneyKeys(body)).toEqual([]);
});

test('a workshop role gets 403 on the settings page and on its action', async ({ page }) => {
	await login(page, 'manager');

	expect((await page.goto(SETTINGS))?.status()).toBe(403);
	const response = await page.request.post(`${SETTINGS}?/save`, {
		headers: { origin: ORIGIN },
		form: { enabled: 'request.ready:email' }
	});
	expect(response.status()).toBe(403);
});

test('a guest is sent to the login form', async ({ page }) => {
	await page.goto(SETTINGS);
	await expect(page).toHaveURL(/\/login\?redirectTo=/);
});
