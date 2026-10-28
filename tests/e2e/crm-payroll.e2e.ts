import { like } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import {
	payrollLines,
	payrollPeriods,
	staff,
	workDayStaff,
	workDays,
	workEntries,
	workEntryStaff,
	workTypes
} from '../../src/lib/server/db/schema';
import { crmNavLink, login } from './fixtures';
import { e2eDb } from './transitions';

const ORIGIN = 'http://localhost:4173';

// The file outlives a run: a week closed by an earlier run would refuse every day of this one.
test.beforeAll(() => {
	const db = e2eDb();
	db.delete(payrollLines).run();
	db.delete(payrollPeriods).run();
	db.delete(workEntryStaff).run();
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

async function addWork(page: Page, title: string, roubles: number, role?: string): Promise<void> {
	await page.goto('/crm/payroll/works');
	await openModal(page, 'Добавить работу');
	const modal = page.getByTestId('modal');
	await modal.getByLabel('Название работы').fill(title);
	if (role) {
		await modal.getByLabel('Роль').click();
		await page.getByRole('option', { name: role, exact: true }).click();
		await expect(page.getByRole('listbox')).toHaveCount(0);
	}
	await modal.getByLabel('Стоимость за единицу, ₽').fill(String(roubles));
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(page.getByTestId('data-table-row').filter({ hasText: title })).toBeVisible();
}

async function addWorker(page: Page, fullName: string): Promise<void> {
	await page.goto('/crm/payroll/staff');
	await openModal(page, 'Добавить сотрудника');
	const modal = page.getByTestId('modal');
	await modal.getByLabel('ФИО').fill(fullName);
	await modal.getByLabel('Должность').fill('Столяр');
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(page.getByTestId('data-table-row').filter({ hasText: fullName })).toBeVisible();
}

const shareOf = (page: Page, fullName: string) =>
	page.getByTestId('day-share').filter({ hasText: fullName });

const lineOf = (page: Page, fullName: string) =>
	page.getByRole('row', { name: new RegExp(fullName) });

test('v1.61: a work of the grinder carries its role on the list and in the day', async ({
	page
}) => {
	const work = `E2E Шлифовка ${Date.now()}`;
	await login(page, 'manager');
	await addWork(page, work, 400, 'Шлифовщик');

	const row = page.getByTestId('data-table-row').filter({ hasText: work });
	await expect(row.getByTestId('work-role')).toHaveText('Шлифовщик');

	await page.goto('/crm/payroll');
	await page.getByTestId('mark-today').click();
	await page.getByRole('button', { name: 'Добавить работу' }).click();
	await page.getByTestId('day-entry').getByLabel('Работа').click();
	await expect(page.getByRole('option', { name: `Шлифовщик: ${work}, 400 ₽` })).toBeVisible();
});

test('C10: the administrator marks a day, closes the week and pays it out', async ({ page }) => {
	const suffix = Date.now();
	const work = `E2E Ящик ${suffix}`;
	const crew = [`E2E Анна ${suffix}`, `E2E Борис ${suffix}`, `E2E Виктор ${suffix}`];

	await login(page, 'manager');
	await addWork(page, work, 850);
	for (const fullName of crew) await addWorker(page, fullName);
	const [anna = '', boris = '', viktor = ''] = crew;

	// The customer sample: three joiners came, Anna and Boris made one box for 850 roubles.
	await page.goto('/crm/payroll');
	await page.getByTestId('mark-today').click();
	await expect(page).toHaveURL(/\/crm\/payroll\/day\/\d{4}-\d{2}-\d{2}$/);
	const dayUrl = page.url();
	const present = page.getByTestId('day-staff');
	await expect(async () => {
		for (const fullName of crew) {
			const box = present.getByRole('checkbox', { name: new RegExp(fullName) });
			if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
			await expect(box).toHaveAttribute('aria-checked', 'true', { timeout: 1000 });
		}
	}).toPass();
	await page.getByRole('button', { name: 'Добавить работу' }).click();
	const entry = page.getByTestId('day-entry');
	await entry.getByLabel('Работа').click();
	await page.getByRole('option', { name: new RegExp(work) }).click();
	// The closing list swallows the next click: tick the crew only once it is gone.
	await expect(page.getByRole('listbox')).toHaveCount(0);
	await entry.getByLabel('Количество').fill('1');
	for (const fullName of [anna, boris]) {
		const box = entry.getByRole('checkbox', { name: fullName });
		await box.click();
		await expect(box).toHaveAttribute('aria-checked', 'true');
	}
	await expect(page.getByTestId('day-total')).toHaveText('850 ₽');
	await expect(shareOf(page, anna)).toContainText('425 ₽');
	await expect(shareOf(page, viktor)).toContainText('0 ₽');
	await page.getByRole('button', { name: 'Сохранить день' }).click();
	await expect(page.getByText('День сохранён').first()).toBeVisible();
	await page.reload();
	await expect(page.getByTestId('day-present')).toHaveText('3');
	await expect(shareOf(page, boris)).toContainText('425 ₽');
	await expect(shareOf(page, viktor)).toContainText('0 ₽');

	await page.goto('/crm/payroll');
	await expect(page.getByTestId('week-status')).toHaveText('Открыта');
	await expect(lineOf(page, anna).getByTestId('line-payout')).toHaveText('425 ₽');
	await expect(lineOf(page, viktor).getByTestId('line-payout')).toHaveText('0 ₽');
	await expect(page.getByTestId('week-total')).toHaveText('850 ₽');

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
	await expect(lineOf(page, crew[0] ?? '').getByTestId('line-payout')).toHaveText('525 ₽');

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
	await expect(page.getByRole('row', { name: new RegExp(work) })).toContainText('850 ₽');
	await expect(page.getByTestId('report-accrued')).toHaveText('850 ₽');
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
	await expect(crmNavLink(page, 'Выплаты')).toHaveCount(0);

	await page.context().clearCookies();
	await login(page, 'cp_admin');
	expect((await page.goto('/crm/payroll'))?.status()).toBe(403);
});
