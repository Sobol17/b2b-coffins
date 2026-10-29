import { expect, test, type Page } from '@playwright/test';
import { crmNavLink, login, openBell, purchaseMoneyKeys, type RoleKey } from './fixtures';
import { openCard, sendRequest } from './portal-flow';
import { passStation } from './shop-flow';
import { clearOtherDebts, e2eDb, emptyShelf, moneyOf, statusChain, statusOf } from './transitions';

/*
 * The acceptance scenario of stage 2 (tech.md 14, C14): one request goes from the cart of a
 * counterparty employee to `paid`, and each of the seven roles does its part on its own screen.
 * No step uses the CLI: what a role cannot do in the interface, the scenario does not do.
 */

const db = e2eDb();
const QUEUE_TIMEOUT = 15_000;

/** What the steps hand to each other, the way people do: by the number of the request. */
const shared = { number: '', card: '' };

/** The fanout runs in the background, so the bell is opened again until the event is there. */
async function expectInBell(page: Page, home: string, title: string): Promise<void> {
	await expect(async () => {
		await page.goto(home);
		await openBell(page);
		const item = page.getByTestId('bell-item').filter({ hasText: shared.number });
		await expect(item.filter({ hasText: title }).first()).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: QUEUE_TIMEOUT });
}

async function expectSections(page: Page, shown: string[], hidden: string[]): Promise<void> {
	await page.goto('/crm');
	for (const name of shown) await expect(crmNavLink(page, name), name).toHaveCount(1);
	for (const name of hidden) await expect(crmNavLink(page, name), name).toHaveCount(0);
}

test.describe.serial('one request through all seven roles', () => {
	test('cp_employee sends a request and sees it without sums', async ({ page }) => {
		shared.number = await sendRequest(page, 'cp_employee');

		await openCard(page, shared.number);
		await expect(page.getByTestId('request-totals')).toHaveCount(0);
		expect(statusOf(db, shared.number)).toBe('new');
	});

	test('cp_admin finds the request of the employee with its sum', async ({ page }) => {
		await login(page, 'cp_admin');

		await openCard(page, shared.number);
		await expect(page.getByTestId('request-totals')).toBeVisible();
	});

	test('manager hears of the request in the bell and takes it into work', async ({ page }) => {
		await login(page, 'manager');
		await expectInBell(page, '/crm', 'Новая заявка');

		await page.getByTestId('bell-item').filter({ hasText: shared.number }).first().click();
		await expect(page).toHaveURL(/\/crm\/requests\/\d+$/);
		shared.card = new URL(page.url()).pathname;
		// The shelves of the shared database may hold the piece: take it off so the stations make it.
		emptyShelf(db, shared.number);
		await page.getByRole('button', { name: 'Принять в работу' }).click();

		await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'В работе' })).toBeVisible();
		expect(statusOf(db, shared.number)).toBe('in_work');
	});

	for (const role of [
		'carpenter',
		'grinder',
		'painter',
		'upholsterer'
	] as const satisfies readonly RoleKey[]) {
		// Every product passes the four stations in turn (tech.md §20.4), each on its own account.
		test(`${role} takes the request at the station and passes it on`, async ({ page }) => {
			await login(page, role);

			await expectSections(page, ['Цех', 'Склад'], ['Заявки', 'Доставка', 'Выплаты', 'Отчёты']);
			expect((await page.goto(shared.card))?.status()).toBe(403);
			await passStation(page, shared.number);
			expect(purchaseMoneyKeys(await page.content())).toEqual([]);
		});
	}

	test('the last station leaves the request ready for the driver', () => {
		expect(statusOf(db, shared.number)).toBe('ready');
	});

	test('driver hears of the ready request, loads it and hands it over', async ({ page }) => {
		await login(page, 'driver');
		await expectSections(page, ['Доставка'], ['Заявки', 'Цех', 'Склад', 'Выплаты', 'Отчёты']);
		await expectInBell(page, '/crm', 'Заявка готова к выдаче');
		expect((await page.goto(shared.card))?.status()).toBe(403);

		await page.goto('/crm/delivery');
		const stop = page.getByTestId('delivery-stop').filter({ hasText: shared.number });
		await stop.getByLabel('Штук').fill('1');
		await stop.getByRole('button', { name: 'Погрузил' }).click();
		await expect(stop.getByTestId('delivery-loaded')).toHaveText('Погружено 1 из 1');
		// No cash on the spot: the agency pays by invoice, so the request waits for the money.
		await stop.getByRole('button', { name: 'Доставлено' }).click();

		await expect(page.getByText('Заявка доставлена').first()).toBeVisible();
		expect(statusOf(db, shared.number)).toBe('awaiting_payment');
	});

	test('manager marks the payment and the system closes the request', async ({ page }) => {
		await login(page, 'manager');
		await page.goto(shared.card);

		const panel = page.getByTestId('request-payments');
		// A request closes only when its counterparty owes nothing else (tech.md v1.65).
		clearOtherDebts(db, shared.number);
		await panel.getByRole('button', { name: 'Отметить оплату' }).click();
		await expect(page.getByText('Оплата отмечена').first()).toBeVisible();

		await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'Оплачено' })).toBeVisible();
		await expect(page.getByTestId('request-history')).toContainText('Система');
		const money = moneyOf(db, shared.number);
		expect(money.marksMinor).toBe(money.totalMinor);
	});

	test('owner sees the closed request, the sale and the trail in the journal', async ({ page }) => {
		await login(page, 'owner');
		await page.goto(shared.card);
		await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'Оплачено' })).toBeVisible();

		const year = new Date().getFullYear();
		await page.goto(`/crm/reports/sales?from=${year}-01-01&to=${year}-12-31`);
		await expect(page.getByTestId('sales-total')).toBeVisible();
		await expect(page.getByRole('row', { name: /Ритуал-Сервис/ }).first()).toBeVisible();

		await page.goto('/crm/settings/audit?action=request.transition');
		await expect(page.getByTestId('data-table-row').first().getByTestId('audit-action')).toHaveText(
			'Статус заявки изменён'
		);
		expect(statusChain(db, shared.number)).toEqual([
			'draft->new',
			'new->in_work',
			'in_work->ready',
			'ready->delivered',
			'delivered->awaiting_payment',
			'awaiting_payment->paid'
		]);
	});

	test('cp_admin sees the request paid with the share of the fund', async ({ page }) => {
		await login(page, 'cp_admin');
		await expectInBell(page, '/portal', 'Заявка оплачена');

		await openCard(page, shared.number);
		await expect(page.getByText('Оплачено').first()).toBeVisible();
		await expect(page.getByTestId('request-totals')).toBeVisible();
		await expect(page.getByTestId('request-charity')).toBeVisible();
	});

	test('cp_employee sees the request paid and still no purchase price', async ({ page }) => {
		await login(page, 'cp_employee');

		await openCard(page, shared.number);
		await expect(page.getByText('Оплачено').first()).toBeVisible();
		await expect(page.getByTestId('request-totals')).toHaveCount(0);
		const data = await page.request.get(`${new URL(page.url()).pathname}/__data.json`);
		expect(purchaseMoneyKeys(await data.text())).toEqual([]);
	});
});
