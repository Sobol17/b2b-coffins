import { expect, test } from '@playwright/test';
import { charityTransfers } from '../../src/lib/server/db/schema';
import { crmNavLink, login, logout } from './fixtures';
import { sendRequest } from './portal-flow';
import { acceptReady, e2eDb, loadUp, transition } from './transitions';

const PATHS = [
	'/crm/reports',
	'/crm/reports/sales',
	'/crm/reports/counterparties',
	'/crm/reports/stock',
	'/crm/reports/funnel',
	'/crm/reports/lost',
	'/crm/reports/charity'
];
const SHEETS = ['sales', 'counterparties', 'stock', 'funnel', 'lost', 'charity'].map(
	(name) => `/crm/reports/${name}/export.xlsx`
);
// The calendar year of the run: the request delivered below falls inside it.
const YEAR = new Date().getFullYear();
const RANGE = `?from=${YEAR}-01-01&to=${YEAR}-12-31`;
const db = e2eDb();

// The file outlives a run: a transfer left by an earlier run would eat the remainder of this one.
test.beforeAll(() => {
	db.delete(charityTransfers).run();
});

test('C13: the owner reads the period, downloads a sheet and records a transfer', async ({
	page
}) => {
	// A delivered request of this run: a fresh database has nothing accrued to the fund.
	const number = await sendRequest(page, 'cp_admin');
	acceptReady(db, number);
	loadUp(db, number);
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);
	await logout(page);

	await login(page, 'owner');
	await crmNavLink(page, 'Отчёты').click();
	await expect(page.getByTestId('tile-sales')).toBeVisible();

	await page.goto(`/crm/reports/sales${RANGE}`);
	await expect(page.getByTestId('sales-total')).toBeVisible();
	const sheet = await page.request.get(`/crm/reports/sales/export.xlsx${RANGE}`);
	expect(sheet.status()).toBe(200);
	expect(sheet.headers()['content-type']).toContain('spreadsheetml');

	// v1.63: the margin by counterparty opens into the requests behind it.
	await page.goto(`/crm/reports/counterparties${RANGE}`);
	await expect(page.getByTestId('margin-total')).toBeVisible();
	await page.getByRole('link', { name: 'Ритуал-Сервис' }).click();
	await expect(page).toHaveURL(/counterpartyId=\d+/);
	await expect(page.getByTestId('margin-request').filter({ hasText: number })).toBeVisible();
	const margins = await page.request.get(
		`/crm/reports/counterparties/export.xlsx${new URL(page.url()).search}`
	);
	expect(margins.status()).toBe(200);

	await page.goto(`/crm/reports/charity${RANGE}`);
	const remainder = page.getByTestId('tile-remainder');
	await expect(remainder).toBeVisible();
	const before = await remainder.innerText();
	// The button answers once the page is hydrated: retry the click until the dialog opens.
	await expect(async () => {
		await page.getByRole('button', { name: 'Записать перечисление', exact: true }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	const modal = page.getByTestId('modal');
	const amount = modal.getByLabel('Сумма, ₽');
	const documentRef = modal.getByLabel('Документ');
	// Typing can land while the dialog still settles and come back empty, so the form is filled
	// again until both fields hold their values. Only then is it sent.
	await expect(async () => {
		await amount.fill('1');
		await documentRef.fill('E2E ПП 1');
		await expect(amount).toHaveValue('1', { timeout: 500 });
		await expect(documentRef).toHaveValue('E2E ПП 1', { timeout: 500 });
	}).toPass();
	await modal.getByRole('button', { name: 'Записать', exact: true }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(page.getByRole('row', { name: /E2E ПП 1/ })).toBeVisible();
	await expect(remainder).not.toHaveText(before);
});

test('C13: a broken period keeps the page and refuses the sheet', async ({ page }) => {
	await login(page, 'owner');
	await page.goto('/crm/reports/sales?from=2026-03-02&to=2026-03-01');
	await expect(page.getByTestId('report-problem')).toBeVisible();
	const sheet = await page.request.get(
		'/crm/reports/sales/export.xlsx?from=2026-03-02&to=2026-03-01'
	);
	expect(sheet.status()).toBe(422);
});

for (const role of ['manager', 'driver', 'cp_admin'] as const) {
	test(`C13: ${role} gets 403 on every report, sheet and action`, async ({ page }) => {
		await login(page, role);
		await expect(crmNavLink(page, 'Отчёты')).toHaveCount(0);
		for (const path of PATHS) expect((await page.goto(path))?.status()).toBe(403);
		for (const sheet of SHEETS) expect((await page.request.get(sheet + RANGE)).status()).toBe(403);
		const forged = {
			transfer: { amountMinor: '100', transferredOn: `${YEAR}-01-01` },
			reverse: { transferId: '1', comment: 'forged' }
		};
		for (const [action, form] of Object.entries(forged)) {
			const answer = await page.request.post(`/crm/reports/charity?/${action}`, {
				form,
				headers: { origin: 'http://localhost:4173' }
			});
			expect(answer.status()).toBe(403);
		}
	});
}
