import { expect, test, type Page } from '@playwright/test';
import { login, logout, purchaseMoneyKeys } from './fixtures';
import { sendRequest } from './portal-flow';
import { e2eDb, stockUp, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const SETTINGS = '/portal/profile/notifications';
const QUEUE_TIMEOUT = 15_000;

function toReady(number: string): void {
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
}

/** The page carries the event feed too, so every assertion here names the block it looks in. */
function logRows(page: Page) {
	return page.getByTestId('delivery-log').getByTestId('data-table-row');
}

function feedRows(page: Page) {
	return page.getByTestId('notification-feed').getByTestId('data-table-row');
}

/** The fanout runs in the background, so the page is loaded again until the row turns up. */
async function expectInFeed(page: Page, number: string, event: string): Promise<void> {
	await expect(async () => {
		await page.goto(SETTINGS);
		await expect(
			feedRows(page).filter({ hasText: number }).filter({ hasText: event }).first()
		).toBeVisible({ timeout: 500 });
	}).toPass({ timeout: QUEUE_TIMEOUT });
}

test('an event lands in the feed and sends nothing: no letter, no channel row', async ({
	page
}) => {
	const number = await sendRequest(page, 'cp_employee');
	toReady(number);

	// The acceptance is an event of its own since v1.49.
	await expectInFeed(page, number, 'Заявка принята в работу');
	await expectInFeed(page, number, 'Заявка готова к выдаче');
	// Mail left the event channels and push has no driver before C15: the log has nothing to show.
	await expect(logRows(page)).toHaveCount(0);

	await logout(page);
	await login(page, 'cp_admin');
	await expectInFeed(page, number, 'Заявка готова к выдаче');
});

test('the page offers push and the bot, never mail', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto(SETTINGS);

	await expect(page.getByTestId('notification-pref')).toHaveCount(12);
	await expect(page.getByRole('checkbox', { name: /почта/i })).toHaveCount(0);
	await expect(page.getByRole('checkbox', { name: 'Заявка готова к выдаче: пуш' })).toBeChecked();
});

test('a switched-off event keeps the choice over a reload', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto(SETTINGS);
	const ready = page.getByRole('checkbox', { name: 'Заявка готова к выдаче: пуш' });
	await expect(ready).toBeChecked();

	await ready.click();
	await page.getByTestId('save-notifications').click();
	const toast = page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' });
	await expect(toast).toBeVisible();
	// Six events on push plus the same six on MAX, which waits for its driver in C16.
	await expect(toast.getByTestId('toast-description')).toHaveText('Включено: 5 из 12');

	await page.reload();
	await expect(ready).not.toBeChecked();

	await ready.check();
	await page.getByTestId('save-notifications').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' })).toBeVisible();
});

test('turning every channel off warns that the feed still shows the events', async ({ page }) => {
	await login(page, 'cp_employee');
	await page.goto(SETTINGS);
	const boxes = page.getByRole('checkbox');
	const checked = await page.getByRole('checkbox', { checked: true }).all();
	for (const box of await boxes.all()) await box.uncheck();
	await page.getByTestId('save-notifications').click();

	const toast = page.getByTestId('toast').filter({ hasText: 'Уведомления отключены' });
	await expect(toast).toHaveAttribute('data-kind', 'warning');
	await expect(toast).toContainText('ленте');
	// The feed stays: it is a mirror of events, not a channel (v1.33).
	await expect(page.getByRole('checkbox', { name: /лент/i })).toHaveCount(0);

	expect(checked.length).toBeGreaterThan(0);
	for (const box of await page.getByRole('checkbox', { name: /пуш/ }).all()) await box.check();
	await page.getByTestId('save-notifications').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' })).toBeVisible();
});

test('the employee cannot switch on an event its role is not offered', async ({ page }) => {
	await login(page, 'cp_employee');
	await page.goto(SETTINGS);
	await expect(page.getByTestId('notification-pref')).toHaveCount(8);
	await expect(page.getByRole('checkbox', { name: /оплачена/ })).toHaveCount(0);
	await expect(
		page.getByRole('checkbox', { name: 'Заявка готова к выдаче: бот в макс' })
	).toHaveCount(1);

	// A crafted switch the page never offered: the server refuses it and says so in a toast.
	await page.evaluate(() => {
		const input = Object.assign(document.createElement('input'), {
			type: 'hidden',
			name: 'enabled',
			value: 'request.paid:push'
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

	expect(body).toContain('request.ready');
	expect(purchaseMoneyKeys(body)).toEqual([]);
});

test('a workshop role gets 403 on the settings page and on its action', async ({ page }) => {
	await login(page, 'manager');

	expect((await page.goto(SETTINGS))?.status()).toBe(403);
	const response = await page.request.post(`${SETTINGS}?/save`, {
		headers: { origin: ORIGIN },
		form: { enabled: 'request.ready:push' }
	});
	expect(response.status()).toBe(403);
});

test('a guest is sent to the login form', async ({ page }) => {
	await page.goto(SETTINGS);
	await expect(page).toHaveURL(/\/login\?redirectTo=/);
});
