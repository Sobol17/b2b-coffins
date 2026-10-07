import { expect, test } from '@playwright/test';
import { charityTransfers } from '../../src/lib/server/db/schema';
import { login, logout } from './fixtures';
import { sendRequest } from './portal-flow';
import { e2eDb, loadUp, stockUp, transition } from './transitions';

const PATHS = [
	'/crm/reports',
	'/crm/reports/sales',
	'/crm/reports/stock',
	'/crm/reports/funnel',
	'/crm/reports/lost',
	'/crm/reports/charity'
];
const SHEETS = ['sales', 'stock', 'funnel', 'lost', 'charity'].map(
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
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
	loadUp(db, number);
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);
	await logout(page);

	await login(page, 'owner');
	await page.getByRole('link', { name: 'Отчёты', exact: true }).click();
	await expect(page.getByTestId('tile-sales')).toBeVisible();

	await page.goto(`/crm/reports/sales${RANGE}`);
	await expect(page.getByTestId('sales-total')).toBeVisible();
	const sheet = await page.request.get(`/crm/reports/sales/export.xlsx${RANGE}`);
	expect(sheet.status()).toBe(200);
	expect(sheet.headers()['content-type']).toContain('spreadsheetml');

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
	await modal.getByLabel('Сумма, ₽').fill('1');
	await modal.getByLabel('Документ').fill('E2E ПП 1');
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
		await expect(page.getByRole('link', { name: 'Отчёты', exact: true })).toHaveCount(0);
		for (const path of PATHS) expect((await page.goto(path))?.status()).toBe(403);
		for (const sheet of SHEETS) expect((await page.request.get(sheet + RANGE)).status()).toBe(403);
		const forged = await page.request.post('/crm/reports/charity?/transfer', {
			form: { amountMinor: '100', transferredOn: `${YEAR}-01-01` },
			headers: { origin: 'http://localhost:4173' }
		});
		expect(forged.status()).toBe(403);
	});
}
