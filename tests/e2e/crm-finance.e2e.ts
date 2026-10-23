import { eq } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import { paymentMarks, requests, users } from '../../src/lib/server/db/schema';
import { crmNavLink, login } from './fixtures';
import { e2eDb } from './transitions';

const db = e2eDb();
const YEAR = new Date().getFullYear();
const RANGE = `?from=${YEAR}-01-01&to=${YEAR}-12-31`;

/** Whole roubles of a tile: the e2e database keeps rows of earlier runs, so tests compare deltas. */
async function roublesOf(page: Page, testid: string): Promise<number> {
	const text = await page.getByTestId(testid).innerText();
	return Number(text.replace(/[^\d]/g, ''));
}

async function openFinance(page: Page): Promise<void> {
	await page.goto('/crm/finance');
	await expect(page.getByTestId('finance-expense')).toBeVisible();
}

test('C18: the owner records, edits and deletes an expense', async ({ page }) => {
	const comment = `E2E расход ${Date.now()}`;
	await login(page, 'owner');
	await crmNavLink(page, 'Финансы').click();
	await expect(page.getByTestId('finance-expense')).toBeVisible();
	const before = await roublesOf(page, 'finance-expense');

	const form = page.getByTestId('finance-form');
	// The form answers once the page is hydrated: retry until the toast confirms the entry.
	await expect(async () => {
		await form.getByLabel('Сумма, ₽').fill('1234');
		await form.getByLabel('Комментарий').fill(comment);
		await form.getByRole('button', { name: 'Добавить', exact: true }).click();
		await expect(page.getByText('Операция добавлена')).toBeVisible({ timeout: 2000 });
	}).toPass();
	const row = page.getByTestId('finance-feed').getByRole('row', { name: new RegExp(comment) });
	await expect(row).toContainText('−1 234');
	await expect.poll(() => roublesOf(page, 'finance-expense')).toBe(before + 1234);

	await row.getByRole('button', { name: 'Изменить', exact: true }).click();
	const modal = page.getByTestId('modal');
	await modal.getByLabel('Сумма, ₽').fill('2000');
	await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(row).toContainText('−2 000');
	await expect.poll(() => roublesOf(page, 'finance-expense')).toBe(before + 2000);

	await row.getByRole('button', { name: 'Удалить', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
	await expect(row).toHaveCount(0);
	await expect.poll(() => roublesOf(page, 'finance-expense')).toBe(before);
});

test('C18: a payment mark shows up as income without a manual entry', async ({ page }) => {
	const [owner] = db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, 'owner@workshop.example'))
		.all();
	if (!owner) throw new Error('the e2e database has no owner');
	const number = `E2E-FIN-${Date.now()}`;

	await login(page, 'owner');
	await openFinance(page);
	const before = await roublesOf(page, 'finance-income');
	// A request of its own: the mark must not change the money of a request another spec reads.
	const [request] = db
		.insert(requests)
		.values({
			number,
			counterpartyId: null,
			isStockRequest: true,
			createdById: owner.id,
			status: 'paid',
			totalMinor: 77_700,
			paidMinor: 77_700
		})
		.returning({ id: requests.id })
		.all();
	if (!request) throw new Error('failed to insert a request');
	try {
		db.insert(paymentMarks)
			.values({
				requestId: request.id,
				amountMinor: 77_700,
				paidAt: new Date(),
				method: 'bank',
				createdById: owner.id
			})
			.run();
		await openFinance(page);
		await expect.poll(() => roublesOf(page, 'finance-income')).toBe(before + 777);
		await expect(
			page.getByTestId('finance-feed').getByRole('row', { name: new RegExp(`№${number}`) })
		).toContainText('+777');
	} finally {
		db.delete(paymentMarks).where(eq(paymentMarks.requestId, request.id)).run();
		db.delete(requests).where(eq(requests.id, request.id)).run();
	}
});

for (const role of ['manager', 'driver', 'cp_admin'] as const) {
	test(`C18: ${role} gets 403 on the page, the sheet and every action`, async ({ page }) => {
		await login(page, role);
		await expect(crmNavLink(page, 'Финансы')).toHaveCount(0);
		const screen = await page.goto('/crm/finance');
		expect(screen?.status()).toBe(403);
		expect(await screen?.text()).not.toContain('signedMinor');
		const sheet = await page.request.get(`/crm/finance/export.xlsx${RANGE}`);
		expect(sheet.status()).toBe(403);
		const forged = {
			create: { kind: 'expense', amountMinor: '123400', occurredOn: `${YEAR}-01-01`, comment: 'x' },
			update: {
				id: '1',
				kind: 'expense',
				amountMinor: '1',
				occurredOn: `${YEAR}-01-01`,
				comment: 'x'
			},
			remove: { id: '1' }
		};
		for (const [action, form] of Object.entries(forged)) {
			const answer = await page.request.post(`/crm/finance?/${action}`, {
				form,
				headers: { origin: 'http://localhost:4173' }
			});
			expect(answer.status()).toBe(403);
			expect(await answer.text()).not.toContain('signedMinor');
		}
	});
}
