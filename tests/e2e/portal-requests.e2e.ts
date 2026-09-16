import { expect, test, type Page } from '@playwright/test';
import { login } from './fixtures';
import { assignCrew, e2eDb, statusOf, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';

/** The portal side of P4: a sent request is what the registry and the card start from. */
async function sendRequest(page: Page, role: 'cp_admin' | 'cp_employee'): Promise<string> {
	await login(page, role);
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: 'Модель «Волга»' }).click();
	await page.getByLabel('Количество').fill('1');
	await page.getByTestId('add-to-draft').click();

	await page.goto('/portal/cart');
	await page.getByText('Самовывоз со склада мастерской').click();
	await page.getByTestId('submit-draft').click();

	const banner = page.getByTestId('request-submitted');
	await expect(banner).toContainText(/З-\d{4}-\d{5}/);
	const number = (await banner.innerText()).match(/З-\d{4}-\d{5}/)?.[0];
	if (!number) throw new Error('the portal did not show a request number');
	return number;
}

async function openCard(page: Page, number: string): Promise<void> {
	await page.goto('/portal/requests');
	await page.getByTestId('request-row').filter({ hasText: number }).getByText('Открыть').click();
	await expect(page.getByTestId('request-number')).toContainText(number);
}

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
	expect(body).not.toContain('Minor');
	await expect(page.getByTestId('request-totals')).toHaveCount(0);
});

test('a request the actor may not read answers 403 on a direct link', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');
	await openCard(page, number);
	const foreign = new URL(page.url()).pathname;

	// The employee reads only the own requests, so the card of the administrator is out of reach.
	await page.click('button:has-text("Выйти")');
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
		headers: { origin: ORIGIN },
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
