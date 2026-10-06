import { expect, test, type Page } from '@playwright/test';
import { isNull } from 'drizzle-orm';
import { notificationFeed, notifications } from '../../src/lib/server/db/schema';
import { login, logout, purchaseMoneyKeys, type RoleKey } from './fixtures';
import { sendRequest } from './portal-flow';
import { e2eDb, stockUp, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const QUEUE_TIMEOUT = 15_000;
const READ = '/crm/notifications/read';
const JSON_POST = {
	origin: ORIGIN,
	'content-type': 'application/json',
	'x-requested-with': 'fetch'
};

/** Earlier specs leave their events unread in the shared database: the bell starts from zero. */
function emptyBells(): void {
	db.update(notificationFeed)
		.set({ readAt: new Date() })
		.where(isNull(notificationFeed.readAt))
		.run();
}

/** A request the portal has just sent, with the workshop account signed in afterwards. */
async function freshRequest(page: Page, reader: RoleKey): Promise<string> {
	emptyBells();
	const number = await sendRequest(page, 'cp_admin');
	await logout(page);
	await login(page, reader);
	return number;
}

/** The fanout runs in the background, so the page is loaded again until the bell counts. */
async function expectBell(page: Page, count: string): Promise<void> {
	await expect(async () => {
		await page.goto('/crm');
		await expect(page.getByTestId('bell-count')).toHaveText(count, { timeout: 500 });
	}).toPass({ timeout: QUEUE_TIMEOUT });
}

test('C12: the administrator sees a new request in the bell and opens its card', async ({
	page
}) => {
	const number = await freshRequest(page, 'manager');

	await expectBell(page, '1');
	await page.getByTestId('bell-button').click();
	const item = page.getByTestId('bell-item').filter({ hasText: number }).first();
	await expect(item).toContainText('Новая заявка');
	await expect(page.getByTestId('bell-count')).toBeHidden();

	await item.click();
	await expect(page).toHaveURL(/\/crm\/requests\/\d+$/);
	// The counter is recounted by the server on the next navigation, and the row stays read.
	await expect(page.getByTestId('bell-count')).toBeHidden();
});

test('C12: a ready request reaches the driver, and the line leads to the delivery screen', async ({
	page
}) => {
	const number = await freshRequest(page, 'driver');
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);

	// The driver hears of the request once: only when there is something to carry.
	await expectBell(page, '1');
	await page.getByTestId('bell-button').click();
	const item = page.getByTestId('bell-item').filter({ hasText: number });
	await expect(item).toContainText('Заявка готова к выдаче');
	await expect(item).toHaveAttribute('href', '/crm/delivery');

	const body = await (await page.request.get('/crm/notifications/__data.json')).text();
	expect(body).toContain(number);
	expect(purchaseMoneyKeys(body)).toEqual([]);
});

test('C12: an event sends no letter and writes no channel row', async ({ page }) => {
	const before = db.select().from(notifications).all().length;
	const number = await freshRequest(page, 'manager');

	await expectBell(page, '1');
	await page.goto('/crm/notifications');
	const row = page
		.getByTestId('notification-feed')
		.getByTestId('data-table-row')
		.filter({ hasText: number });
	await expect(row).toContainText('Новая заявка');
	await expect(row.getByRole('link', { name: number })).toHaveAttribute(
		'href',
		/\/crm\/requests\/\d+$/
	);
	expect(db.select().from(notifications).all()).toHaveLength(before);
	expect(before).toBe(0);
});

test('C12: a workshop person keeps a channel choice over a reload', async ({ page }) => {
	await login(page, 'manager');
	await page.goto('/crm/notifications');
	const submitted = page.getByRole('checkbox', { name: 'Новая заявка: пуш' });
	await expect(submitted).toBeChecked();
	await expect(page.getByRole('checkbox', { name: /почта/i })).toHaveCount(0);
	// The acceptance is told to the counterparty: the workshop role is not offered it.
	await expect(page.getByRole('checkbox', { name: /принята в работу/ })).toHaveCount(0);

	await submitted.click();
	await page.getByTestId('save-notifications').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' })).toBeVisible();
	await page.reload();
	await expect(submitted).not.toBeChecked();

	await submitted.check();
	await page.getByTestId('save-notifications').click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Настройки сохранены' })).toBeVisible();
});

test('C12: the owner reads the matrix and cannot change it', async ({ page }) => {
	await login(page, 'owner');
	await page.goto('/crm/settings/notifications');

	const matrix = page.getByTestId('notification-matrix');
	await expect(matrix.getByTestId('data-table-row')).toHaveCount(10);
	const lowShelf = matrix.getByTestId('data-table-row').filter({ hasText: 'Остаток ниже порога' });
	await expect(lowShelf.getByTestId('matrix-cell')).toHaveCount(2);
	await expect(lowShelf).toContainText('Колокольчик');
	await expect(matrix).not.toContainText('Почта');
	await expect(matrix.getByRole('checkbox')).toHaveCount(0);
	await expect(matrix.getByRole('button')).toHaveCount(0);
});

test('C12: the matrix answers 403 to the administrator and the driver', async ({ page }) => {
	await login(page, 'manager');
	expect((await page.goto('/crm/settings/notifications'))?.status()).toBe(403);
	// The error page has no header to log out from.
	await page.goto('/crm');
	await logout(page);

	await login(page, 'driver');
	expect((await page.goto('/crm/settings/notifications'))?.status()).toBe(403);
	// The personal page is open to every workshop account.
	expect((await page.goto('/crm/notifications'))?.status()).toBe(200);
});

test('C12: a portal role cannot read or mark the workshop feed', async ({ page }) => {
	await login(page, 'cp_admin');

	expect((await page.goto('/crm/notifications'))?.status()).toBe(403);
	const response = await page.request.post(READ, { headers: JSON_POST, data: { ids: [1] } });
	expect(response.status()).toBe(403);
});

test('C12: nobody marks a row of somebody else read', async ({ page }) => {
	await freshRequest(page, 'manager');
	await expectBell(page, '1');
	// The driver is not told about a submitted request, so every unread row belongs to others.
	const foreign = db
		.select()
		.from(notificationFeed)
		.where(isNull(notificationFeed.readAt))
		.all()
		.map((row) => row.id);
	await logout(page);
	await login(page, 'driver');

	const response = await page.request.post(READ, { headers: JSON_POST, data: { ids: foreign } });

	expect(response.status()).toBe(200);
	expect(foreign.length).toBeGreaterThan(0);
	const stillUnread = db
		.select()
		.from(notificationFeed)
		.where(isNull(notificationFeed.readAt))
		.all()
		.map((row) => row.id);
	expect(stillUnread).toEqual(foreign);
});

test('C12: the read endpoint refuses a bad payload, a plain post and a guest', async ({ page }) => {
	const guest = await page.request.post(READ, {
		headers: JSON_POST,
		data: { ids: [1] },
		maxRedirects: 0
	});
	expect(guest.status()).toBe(303);
	expect(guest.headers()['location']).toContain('/login');

	await login(page, 'manager');
	const bad = await page.request.post(READ, { headers: JSON_POST, data: { ids: ['all'] } });
	expect(bad.status()).toBe(400);
	const plain = await page.request.post(READ, {
		headers: { origin: ORIGIN, 'content-type': 'application/json' },
		data: { ids: [1] }
	});
	expect(plain.status()).toBe(403);
});
