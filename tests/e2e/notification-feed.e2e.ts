import { expect, test, type Page } from '@playwright/test';
import { isNull } from 'drizzle-orm';
import { notificationFeed } from '../../src/lib/server/db/schema';
import { login, logout, openBell } from './fixtures';
import { sendRequest } from './portal-flow';
import { e2eDb, stockUp, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const QUEUE_TIMEOUT = 15_000;

function toReady(number: string): void {
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
}

/** Rows of the event feed; the delivery log below it draws its rows with the same testid. */
function feedRows(page: Page) {
	return page.getByTestId('notification-feed').getByTestId('data-table-row');
}

/**
 * Earlier specs leave their own events unread in the shared e2e database, so the bell is emptied
 * first: after that the counter can only mean the event this test made. The rows are marked read
 * in the database: the list reads a page per visit, and the suite outgrew what that drains in time.
 * The loop stays, because a fanout of an earlier spec may still be on its way.
 */
async function drainBell(page: Page): Promise<void> {
	await expect(async () => {
		db.update(notificationFeed)
			.set({ readAt: new Date() })
			.where(isNull(notificationFeed.readAt))
			.run();
		await page.goto('/portal/profile/notifications');
		await expect(page.getByTestId('bell-count')).toBeHidden({ timeout: 2000 });
	}).toPass({ timeout: QUEUE_TIMEOUT });
}

/** The fanout runs in the background, so the page is loaded again until the row turns up. */
async function expectFeedRow(page: Page, number: string, event: string): Promise<void> {
	await expect(async () => {
		await page.goto('/portal/profile/notifications');
		await expect(feedRows(page).filter({ hasText: number }).first()).toContainText(event, {
			timeout: 500
		});
	}).toPass({ timeout: QUEUE_TIMEOUT });
}

test('the bell counts a new event and the open panel clears it', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');
	await drainBell(page);
	toReady(number);

	// Two events on the way to `ready`: the acceptance is published since v1.49.
	await expect(async () => {
		await page.goto('/portal');
		await expect(page.getByTestId('bell-count')).toHaveText('2', { timeout: 500 });
	}).toPass({ timeout: QUEUE_TIMEOUT });

	await openBell(page);
	const item = page.getByTestId('bell-item').filter({ hasText: number }).first();
	await expect(item).toContainText('Заявка готова к выдаче');
	await expect(page.getByTestId('bell-count')).toBeHidden();

	await item.click();
	await expect(page).toHaveURL(/\/portal\/requests\/\d+$/);
	await expect(page.getByTestId('request-number')).toContainText(number);
	// The counter is recounted by the server on the next navigation, and the row stays read.
	await expect(page.getByTestId('bell-count')).toBeHidden();
});

test('the full list on the settings page shows the event and marks it read', async ({ page }) => {
	const number = await sendRequest(page, 'cp_employee');
	toReady(number);

	await expectFeedRow(page, number, 'Заявка готова к выдаче');

	const row = feedRows(page).filter({ hasText: number }).first();
	await expect(row.getByTestId('feed-state')).toHaveText('Прочитано');
	await expect(row.getByRole('link', { name: number })).toHaveAttribute(
		'href',
		/\/portal\/requests\/\d+$/
	);
});

test('a request written by someone else stays out of the employee feed', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');
	toReady(number);

	await expectFeedRow(page, number, 'Заявка готова к выдаче');

	const body = await (await page.request.get('/portal/profile/notifications/__data.json')).text();
	expect(body).toContain(number);
	await logout(page);
	await login(page, 'cp_employee');
	const foreign = await (
		await page.request.get('/portal/profile/notifications/__data.json')
	).text();
	// The employee did not write this request, so neither its feed nor its log names it.
	expect(foreign).not.toContain(number);
});

test('a workshop role cannot mark a portal feed read', async ({ page }) => {
	await login(page, 'manager');

	const response = await page.request.post('/portal/notifications/read', {
		headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-requested-with': 'fetch' },
		data: { ids: [1] }
	});

	expect(response.status()).toBe(403);
});

test('the read endpoint refuses a payload that is not a list of ids', async ({ page }) => {
	await login(page, 'cp_admin');

	const response = await page.request.post('/portal/notifications/read', {
		headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-requested-with': 'fetch' },
		data: { ids: ['all'] }
	});

	expect(response.status()).toBe(400);
});

test('a guest is sent to the login form', async ({ page }) => {
	const response = await page.request.post('/portal/notifications/read', {
		headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-requested-with': 'fetch' },
		data: { ids: [1] },
		maxRedirects: 0
	});

	expect(response.status()).toBe(303);
	expect(response.headers()['location']).toContain('/login');
});

test('a post without the fetch header is refused', async ({ page }) => {
	await login(page, 'cp_admin');

	const response = await page.request.post('/portal/notifications/read', {
		headers: { origin: ORIGIN, 'content-type': 'application/json' },
		data: { ids: [1] }
	});

	expect(response.status()).toBe(403);
});
