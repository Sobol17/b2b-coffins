import { expect, test } from '@playwright/test';
import { login, logout, purchaseMoneyKeys } from './fixtures';
import { openCard, sendRequest } from './portal-flow';
import { assignCrew, e2eDb, statusOf, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';

test('the counterparty follows the status of a request without calling the workshop', async ({
	page
}) => {
	const number = await sendRequest(page, 'cp_admin');
	assignCrew(db, number, 'carpenter', 'carpenter');
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);

	await openCard(page, number);

	await expect(page.locator('[data-slot="stepper"]')).toContainText('В работе');
	await expect(page.getByTestId('request-totals')).toContainText('Скидка по договору 5 %');
});

test('an employee sees the same card without a single amount', async ({ page }) => {
	const number = await sendRequest(page, 'cp_employee');

	await openCard(page, number);

	const path = new URL(page.url()).pathname;
	const body = await (await page.request.get(`${path}/__data.json`)).text();
	expect(purchaseMoneyKeys(body)).toEqual([]);
	await expect(page.getByTestId('request-totals')).toHaveCount(0);
});

test('a request the actor may not read answers 403 on a direct link', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');
	await openCard(page, number);
	const foreign = new URL(page.url()).pathname;

	// The employee reads only the own requests, so the card of the administrator is out of reach.
	await logout(page);
	await login(page, 'cp_employee');
	const response = await page.request.get(foreign);

	expect(response.status()).toBe(403);
});

test('an attachment is stored on the request and comes back through the files route', async ({
	page
}) => {
	const number = await sendRequest(page, 'cp_admin');
	await openCard(page, number);
	const requestId = new URL(page.url()).pathname.split('/').at(-1) ?? '';

	const uploaded = await page.request.post('/api/files', {
		// SvelteKit refuses a cross-origin form post, and page.request sends no origin of its own.
		headers: { origin: ORIGIN, 'x-requested-with': 'XMLHttpRequest' },
		multipart: {
			requestId,
			file: {
				name: 'Эскиз.pdf',
				mimeType: 'application/pdf',
				buffer: Buffer.from('%PDF-1.4 sketch')
			}
		}
	});
	expect(uploaded.status()).toBe(201);

	await page.reload();
	await expect(page.getByTestId('attachments')).toContainText('Эскиз.pdf');
	const mediaId = ((await uploaded.json()) as { id: number }).id;
	const download = await page.request.get(`/api/files/${mediaId}`);
	expect(download.status()).toBe(200);
});

test('the counterparty writes to the manager and cancels the request from the card', async ({
	page
}) => {
	const number = await sendRequest(page, 'cp_admin');
	await openCard(page, number);

	await page.getByLabel('Сообщение менеджеру').fill('Нужна отгрузка одной партией');
	await page.getByTestId('post-comment').click();
	await expect(page.getByTestId('comment-thread')).toContainText('Нужна отгрузка одной партией');

	await page.getByTestId('cancel-request').click();
	await expect(page.getByText('Отменена').first()).toBeVisible();
	expect(statusOf(db, number)).toBe('cancelled');
});

test('the registry filters by status and finds a request by its number', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');

	await page.goto('/portal/requests');
	await page.getByTestId('status-chip').filter({ hasText: 'Заявка' }).click();
	await expect(page.getByTestId('request-row').filter({ hasText: number })).toBeVisible();

	await page.getByLabel('Поиск по номеру').fill('нет-такого-номера');
	await page.getByLabel('Поиск по номеру').press('Enter');
	await expect(page.getByText('Заявок не найдено')).toBeVisible();
});

test('the home page lists a fresh request among the active ones with its sum', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');

	await page.goto('/portal');

	const row = page.getByTestId('data-table-row').filter({ hasText: number });
	await expect(row).toContainText('Заявка');
	await expect(row).toContainText('₽');
	await expect(page.getByTestId('active-requests-count')).toContainText('в работе');
});

test('an employee sees the active requests on the home page without amounts', async ({ page }) => {
	const number = await sendRequest(page, 'cp_employee');

	await page.goto('/portal');

	const row = page.getByTestId('data-table-row').filter({ hasText: number });
	await expect(row).toContainText('—');
	await expect(row).not.toContainText('₽');
	const body = await (await page.request.get('/portal/__data.json')).text();
	expect(purchaseMoneyKeys(body)).toEqual([]);
});
