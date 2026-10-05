import { like } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import {
	payrollLines,
	payrollPeriods,
	staff,
	workDayStaff,
	workDays,
	workEntries,
	workTypes
} from '../../src/lib/server/db/schema';
import { login } from './fixtures';
import { e2eDb } from './transitions';

const ORIGIN = 'http://localhost:4173';

// The file outlives a run: a week closed by an earlier run would refuse every day of this one.
test.beforeAll(() => {
	const db = e2eDb();
	db.delete(payrollLines).run();
	db.delete(payrollPeriods).run();
	db.delete(workEntries).run();
	db.delete(workDayStaff).run();
	db.delete(workDays).run();
	db.delete(workTypes).where(like(workTypes.title, 'E2E %')).run();
	db.delete(staff).where(like(staff.fullName, 'E2E %')).run();
});

async function openModal(page: Page, button: string): Promise<void> {
	// A click before hydration lands on the server markup: repeat until the dialog opens.
	await expect(async () => {
		await page.getByRole('button', { name: button, exact: true }).first().click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
}

async function addWork(page: Page, title: string, roubles: number): Promise<void> {
	await page.goto('/crm/payroll/works');
	await openModal(page, 'Добавить работу');
	const modal = page.getByTestId('modal');
	await modal.getByLabel('Название работы').fill(title);
	await modal.getByLabel('Стоимость за единицу, ₽').fill(String(roubles));
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
}

async function addWorker(page: Page, fullName: string): Promise<void> {
	await page.goto('/crm/payroll/staff');
	await openModal(page, 'Добавить сотрудника');
	const modal = page.getByTestId('modal');
	await modal.getByLabel('ФИО').fill(fullName);
	await modal.getByLabel('Должность').fill('Столяр');
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(page.getByRole('row', { name: new RegExp(fullName) })).toBeVisible();
}

const lineOf = (page: Page, fullName: string) =>
	page.getByRole('row', { name: new RegExp(fullName) });

test('C10: the administrator marks a day, closes the week and pays it out', async ({ page }) => {
	const suffix = Date.now();
	const work = `E2E Ящик ${suffix}`;
	const crew = [`E2E Анна ${suffix}`, `E2E Борис ${suffix}`, `E2E Виктор ${suffix}`];

	await login(page, 'manager');
	await addWork(page, work, 200);
	for (const fullName of crew) await addWorker(page, fullName);

	// The business sample: three people, 10 boxes at 200 roubles, 2000 / 3 goes down to 666.
	await page.goto('/crm/payroll');
	await page.getByTestId('mark-today').click();
	await expect(page).toHaveURL(/\/crm\/payroll\/day\/\d{4}-\d{2}-\d{2}$/);
	const dayUrl = page.url();
	await expect(async () => {
		for (const fullName of crew) {
			const box = page.getByRole('checkbox', { name: new RegExp(fullName) });
			if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
			await expect(box).toHaveAttribute('aria-checked', 'true', { timeout: 1000 });
		}
	}).toPass();
	await page.getByLabel(work).fill('10');
	await expect(page.getByTestId('day-total')).toHaveText(/^2\s000 ₽$/);
	await expect(page.getByTestId('day-share')).toHaveText('666 ₽');
	await page.getByRole('button', { name: 'Сохранить день' }).click();
	await expect(page.getByText('День сохранён').first()).toBeVisible();
	await page.reload();
	await expect(page.getByTestId('day-present')).toHaveText('3');
	await expect(page.getByTestId('day-share')).toHaveText('666 ₽');

	await page.goto('/crm/payroll');
	await expect(page.getByTestId('week-status')).toHaveText('Открыта');
	await expect(lineOf(page, crew[0] ?? '').getByTestId('line-payout')).toHaveText('666 ₽');
	await expect(page.getByTestId('week-total')).toHaveText(/^1\s998 ₽$/);

	await expect(async () => {
		await lineOf(page, crew[0] ?? '')
			.getByRole('button', { name: 'Корректировка' })
			.click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByTestId('modal').getByLabel('Сумма, ₽').fill('100');
	await page.getByTestId('modal').getByLabel('Комментарий').fill('Премия');
	await page.getByTestId('modal').getByRole('button', { name: 'Сохранить' }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(lineOf(page, crew[0] ?? '').getByTestId('line-payout')).toHaveText('766 ₽');

	await openModal(page, 'Закрыть неделю');
	await page.getByTestId('modal').getByRole('button', { name: 'Закрыть неделю' }).click();
	await expect(page.getByTestId('week-status')).toHaveText('Закрыта');

	// A closed week is refused by the server, not only by the missing form.
	await page.goto(dayUrl);
	await expect(page.getByText('Неделя закрыта.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Сохранить день' })).toHaveCount(0);
	const forged = await page.request.post(`${dayUrl}?/save`, {
		headers: { origin: ORIGIN },
		form: {}
	});
	expect(await forged.json()).toMatchObject({ type: 'failure', status: 409 });

	await page.goto('/crm/payroll');
	await expect(async () => {
		await lineOf(page, crew[0] ?? '')
			.getByRole('button', { name: 'Выплачено' })
			.click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByTestId('modal').getByRole('button', { name: 'Выплачено' }).click();
	await expect(lineOf(page, crew[0] ?? '').getByTestId('line-paid')).toContainText('Выплачено');

	const sheetHref = await page.getByRole('link', { name: 'Ведомость XLSX' }).getAttribute('href');
	const sheet = await page.request.get(sheetHref ?? '');
	expect(sheet.status()).toBe(200);
	expect(sheet.headers()['content-type']).toContain('spreadsheetml');

	// Reopening is refused while a payout stands, then goes through with a reason.
	await lineOf(page, crew[0] ?? '')
		.getByRole('button', { name: 'Снять отметку' })
		.click();
	await expect(lineOf(page, crew[0] ?? '').getByTestId('line-paid')).toHaveCount(0);
	await openModal(page, 'Открыть неделю');
	await page.getByTestId('modal').getByLabel('Причина').fill('Забыли работу');
	await page.getByTestId('modal').getByRole('button', { name: 'Открыть неделю' }).click();
	await expect(page.getByTestId('week-status')).toHaveText('Открыта');

	await page.goto('/crm/payroll/reports');
	await expect(page.getByRole('row', { name: new RegExp(work) })).toContainText(/2\s000 ₽/);
	await expect(page.getByTestId('report-accrued')).toHaveText(/^1\s998 ₽$/);
});

test('C10: the driver and the portal get 403 on the payroll', async ({ page }) => {
	await login(page, 'driver');
	for (const path of [
		'/crm/payroll',
		'/crm/payroll/staff',
		'/crm/payroll/works',
		'/crm/payroll/reports',
		'/crm/payroll/day/2026-10-05'
	]) {
		expect((await page.goto(path))?.status()).toBe(403);
	}
	expect((await page.request.get('/crm/payroll/sheet.xlsx?week=2026-10-05')).status()).toBe(403);
	const forged = await page.request.post('/crm/payroll/works?/create', {
		headers: { origin: ORIGIN },
		form: { title: 'E2E Чужая работа', rateMinor: '100' }
	});
	expect(forged.status()).toBe(403);
	await page.goto('/crm');
	await expect(page.getByRole('link', { name: 'Выплаты' })).toHaveCount(0);

	await page.context().clearCookies();
	await login(page, 'cp_admin');
	expect((await page.goto('/crm/payroll'))?.status()).toBe(403);
});
