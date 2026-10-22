import { expect, test, type Page } from '@playwright/test';
import {
	OTHER_COUNTERPARTY_ADMIN,
	login,
	loginAs,
	logout,
	openBell,
	purchaseMoneyKeys,
	queueIdle
} from './fixtures';
import { openCard, sendRequest } from './portal-flow';

/** Subjects carry the run moment: the e2e database keeps the threads of earlier runs. */
const unique = (text: string) => `${text} ${Date.now()}`;

/** Opens a thread from the card of a fresh request and returns the path of the thread page. */
async function askAboutRequest(page: Page, subject: string): Promise<string> {
	const number = await sendRequest(page, 'cp_employee');
	await openCard(page, number);
	await page.getByTestId('ask-about-request').click();
	await page.getByLabel('Тема').fill(subject);
	await page.getByLabel('Сообщение').fill('Успеете собрать к пятнице?');
	await page.getByTestId('support-open').click();
	await page.waitForURL(/\/portal\/support\/\d+$/);
	await expect(page.getByTestId('support-subject')).toHaveText(subject);
	await expect(page.getByTestId('support-messages')).toContainText('Успеете собрать к пятнице?');
	return new URL(page.url()).pathname;
}

test('C17: an employee asks about a request and the workshop answers', async ({ page }) => {
	const subject = unique('Сроки по заявке');
	const portalPath = await askAboutRequest(page, subject);
	const id = portalPath.split('/').at(-1) ?? '';
	await logout(page);

	await login(page, 'manager');
	await page.goto(`/crm/support?search=${encodeURIComponent(subject)}`);
	const row = page.getByTestId('data-table-row').filter({ hasText: subject });
	await expect(row.getByTestId('support-state')).toHaveText('Ждёт ответа');
	await row.getByRole('link', { name: subject }).click();
	await page.waitForURL(`/crm/support/${id}`);
	await page.getByLabel('Сообщение').fill('Успеем, соберём в четверг');
	await page.getByTestId('support-send').click();
	await expect(page.getByTestId('support-messages')).toContainText('Успеем, соберём в четверг');
	await queueIdle(page);
	await logout(page);

	await login(page, 'cp_employee');
	await openBell(page);
	await expect(page.getByText(`№${id} ${subject}`).first()).toBeVisible();
	await page.goto(portalPath);
	await expect(page.getByTestId('support-messages')).toContainText('Успеем, соберём в четверг');
	await expect(page.getByTestId('support-state')).toHaveText('Есть ответ');

	await page.getByTestId('support-close').click();
	await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
	await expect(page.getByTestId('support-closed')).toBeVisible();
	await expect(page.getByTestId('support-send')).toHaveCount(0);
});

test('C17: the counterparty administrator sees the thread, a stranger does not', async ({
	page
}) => {
	const subject = unique('Обивка');
	const portalPath = await askAboutRequest(page, subject);
	const body = await (await page.request.get(`${portalPath}/__data.json`)).text();
	expect(purchaseMoneyKeys(body)).toEqual([]);
	await logout(page);

	await login(page, 'cp_admin');
	await page.goto('/portal/support');
	await expect(
		page.getByTestId('data-table-row').filter({ hasText: subject }).first()
	).toBeVisible();
	await logout(page);

	await loginAs(page, OTHER_COUNTERPARTY_ADMIN);
	expect((await page.goto(portalPath))?.status()).toBe(404);
});

test('C17: workshop roles without the right get 403 and a guest goes to login', async ({
	page
}) => {
	await login(page, 'driver');
	expect((await page.goto('/crm/support'))?.status()).toBe(403);
	// The 403 page has no account menu, so the guest is made by dropping the session cookie.
	await page.context().clearCookies();

	await page.goto('/portal/support');
	await expect(page).toHaveURL(/\/login/);
});
