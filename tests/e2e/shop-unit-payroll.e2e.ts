import { eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import {
	payrollLines,
	payrollPeriods,
	shopUnitWorks,
	staff,
	users,
	workDays,
	workEntries,
	workTypes,
	requestItems,
	requests
} from '../../src/lib/server/db/schema';
import { enterRequest } from './crm-flow';
import { ACCOUNTS, login } from './fixtures';
import { e2eDb, emptyShelf } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';

test('a worker claims one piece, earns pending pay and receives confirmed pay without seeing another salary', async ({
	page
}) => {
	await login(page, 'carpenter');
	expect((await page.goto('/crm/salary'))?.status()).toBe(200);
	await page.context().clearCookies();
	// These are isolated E2E payroll fixtures, not the workshop database.
	db.delete(payrollLines).run();
	db.delete(payrollPeriods).run();
	db.delete(workEntries).run();
	db.delete(shopUnitWorks).run();
	db.delete(workDays).run();
	await login(page, 'manager');
	const number = await enterRequest(page, `Расчёт ${Date.now()}`, 'Венге', 1);
	emptyShelf(db, number);
	await page.getByRole('button', { name: 'Принять в работу' }).click();
	await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'В работе' })).toBeVisible();
	const item = db
		.select({ variantId: requestItems.variantId })
		.from(requestItems)
		.innerJoin(requests, eq(requests.id, requestItems.requestId))
		.where(eq(requests.number, number))
		.get()!;
	const existing = db
		.select()
		.from(workTypes)
		.all()
		.find((row) => row.variantId === item.variantId && row.roleCode === 'carpenter');
	if (existing)
		db.update(workTypes)
			.set({ rateMinor: 85_000, isActive: true })
			.where(eq(workTypes.id, existing.id))
			.run();
	else
		db.insert(workTypes)
			.values({
				title: `E2E Расценка ${item.variantId}`,
				variantId: item.variantId,
				roleCode: 'carpenter',
				rateMinor: 85_000
			})
			.run();
	const account = db.select().from(users).where(eq(users.email, ACCOUNTS.carpenter.email)).get()!;
	const own = db.select().from(staff).where(eq(staff.userId, account.id)).get()!;
	const other = db
		.insert(staff)
		.values({ fullName: `E2E Второй столяр ${Date.now()}`, position: 'Столяр' })
		.returning()
		.get()!;
	await page.goto('/crm/payroll');
	await page.getByTestId('mark-today').click();
	await expect(page).toHaveURL(/\/crm\/payroll\/day\/\d{4}-\d{2}-\d{2}$/);
	const dayPath = new URL(page.url()).pathname;
	for (const worker of [own, other]) {
		await page
			.getByTestId('day-staff')
			.getByRole('checkbox', { name: new RegExp(worker.fullName) })
			.check();
		await page
			.getByTestId('day-carpenters')
			.getByRole('checkbox', { name: worker.fullName, exact: true })
			.check();
	}
	await page.getByRole('button', { name: 'Сохранить день' }).click();
	await expect(page.getByText('День сохранён').first()).toBeVisible();
	await page.context().clearCookies();
	await login(page, 'carpenter');
	await page.goto(`/crm/shop?q=${encodeURIComponent(number)}`);
	await page.getByTestId('shop-task').filter({ hasText: number }).click();
	await expect(page.getByTestId('shop-task-number')).toHaveText(number);
	const visitPath = new URL(page.url()).pathname;
	const piece = page.getByTestId('shop-unit').first();
	const unitId = await piece.getAttribute('data-unit-id');
	await piece.getByRole('button', { name: 'Взять в работу', exact: true }).click();
	await expect(piece.getByRole('button', { name: 'Выполнено', exact: true })).toBeEnabled();
	await page.context().clearCookies();
	await login(page, 'manager');
	const stolen = await page.request.post(`${visitPath}?/takeUnit`, {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { unitId: unitId! }
	});
	const refusal = await stolen.json();
	expect(refusal, JSON.stringify(refusal)).toMatchObject({ type: 'failure', status: 409 });
	await page.context().clearCookies();
	await login(page, 'carpenter');
	await page.goto(visitPath);
	await page
		.getByTestId('shop-unit')
		.first()
		.getByRole('button', { name: 'Выполнено', exact: true })
		.click();
	await expect(page.getByTestId('shop-job-count')).toContainText('Сделано 1 из 1');
	await page.goto('/crm/salary');
	await expect(page.getByTestId('salary-pending')).toHaveText('425 ₽');
	await expect(page.getByText(other.fullName, { exact: true })).toHaveCount(0);
	await page.context().clearCookies();
	await login(page, 'manager');
	await page.goto(dayPath);
	await page.getByRole('button', { name: 'Подтвердить работы дня', exact: true }).click();
	await expect(page.getByText('Работы дня подтверждены').first()).toBeVisible();
	await page.context().clearCookies();
	await login(page, 'carpenter');
	await page.goto(`/crm/salary?staffId=${other.id}`);
	await expect(page.getByTestId('salary-pending')).toHaveText('0 ₽');
	await expect(page.getByTestId('salary-accrued')).toHaveText('425 ₽');
	await expect(page.getByText(other.fullName, { exact: true })).toHaveCount(0);
	const forbidden = await page.request.post(`${dayPath}?/confirm`, {
		headers: { origin: ORIGIN },
		form: {}
	});
	expect(forbidden.status()).toBe(403);
	await page.context().clearCookies();
	await login(page, 'manager');
	await page.goto('/crm/payroll');
	await expect(async () => {
		await page.getByRole('button', { name: 'Закрыть неделю', exact: true }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page
		.getByTestId('modal')
		.getByRole('button', { name: 'Закрыть неделю', exact: true })
		.click();
	await expect(page.getByTestId('week-status')).toHaveText('Закрыта');
	await page
		.getByRole('row', { name: new RegExp(own.fullName) })
		.getByRole('button', { name: 'Выплачено', exact: true })
		.click();
	await page.getByTestId('modal').getByRole('button', { name: 'Выплачено', exact: true }).click();
	await expect(
		page.getByRole('row', { name: new RegExp(own.fullName) }).getByTestId('line-paid')
	).toBeVisible();
	await page.context().clearCookies();
	await login(page, 'carpenter');
	await page.goto('/crm/salary');
	await expect(page.getByTestId('salary-paid')).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.screenshot({ path: '/tmp/b2b-coffins-salary-mobile.png', fullPage: true });
});
