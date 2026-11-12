import { eq, inArray } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import {
	dictItems,
	products,
	productVariants,
	roles,
	staff,
	userRoles,
	users,
	workTypes
} from '../../src/lib/server/db/schema';
import { login } from './fixtures';
import { e2eDb } from './transitions';

const suffix = Date.now();
const sku = `E2E-DIRECTORY-${suffix}`;
const model = `E2E Модель ${suffix}`;
const variantLabel = `${sku}-180 · ${model} · 180`;
const accountName = `E2E Учётная запись ${suffix}`;
const workerName = `E2E Сотрудник ${suffix}`;
const otherName = `E2E Другой ${suffix}`;
let productId: number;
let variantId: number;
let userId: number;

test.beforeAll(() => {
	const db = e2eDb();
	const material = db.select().from(dictItems).where(eq(dictItems.dict, 'material')).get()!;
	productId = db.insert(products).values({ sku, title: model }).returning().get()!.id;
	variantId = db
		.insert(productVariants)
		.values({ productId, sku: `${sku}-180`, sizeCode: '180', materialId: material.id })
		.returning()
		.get()!.id;
	userId = db
		.insert(users)
		.values({
			email: `e2e.directory.${suffix}@workshop.example`,
			fullName: accountName,
			scope: 'crm',
			passwordHash: 'not-a-login-password'
		})
		.returning()
		.get()!.id;
	const role = db.select().from(roles).where(eq(roles.code, 'carpenter')).get()!;
	db.insert(userRoles).values({ userId, roleId: role.id }).run();
});

test.afterAll(() => {
	const db = e2eDb();
	db.delete(workTypes).where(eq(workTypes.variantId, variantId)).run();
	db.delete(staff)
		.where(inArray(staff.fullName, [workerName, otherName, `${workerName} оклад`]))
		.run();
	db.delete(users).where(eq(users.id, userId)).run();
	db.delete(productVariants).where(eq(productVariants.id, variantId)).run();
	db.delete(products).where(eq(products.id, productId)).run();
});

async function openModal(page: Page, button: string): Promise<void> {
	await expect(async () => {
		await page.getByRole('button', { name: button, exact: true }).first().click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
}

async function choose(page: Page, field: string, option: string): Promise<void> {
	await page.getByTestId('modal').getByLabel(field, { exact: true }).click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

test('the manager assigns a role rate to a catalog position and sees conflicts in the dialog', async ({
	page
}) => {
	const title = `E2E Расценка ${suffix}`;
	await login(page, 'manager');
	await page.goto('/crm/payroll/works');
	await openModal(page, 'Добавить работу');
	const modal = page.getByTestId('modal');
	await modal.getByLabel('Название работы').fill(title);
	await choose(page, 'Позиция каталога', variantLabel);
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(modal.getByTestId('work-type-error')).toContainText('выберите роль цеха');
	await choose(page, 'Роль', 'Столяр');
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(modal).toBeHidden();
	await page.getByRole('searchbox', { name: 'Поиск по работам и позициям' }).fill(sku);
	await page.getByRole('button', { name: 'Найти', exact: true }).click();
	const row = page.getByTestId('data-table-row').filter({ hasText: variantLabel });
	await expect(row.getByTestId('work-variant')).toHaveText(variantLabel);
	await expect(row.getByTestId('work-rate')).toHaveText('0 ₽');
	await row.getByRole('button', { name: /^Изменить: Столяр/ }).click();
	await expect(modal.getByLabel('Позиция каталога', { exact: true })).toHaveText(variantLabel);
	await modal.getByLabel('Стоимость за единицу, ₽').fill('250');
	await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(modal).toBeHidden();
	await expect(row.getByTestId('work-rate')).toHaveText('250 ₽');
	await openModal(page, 'Добавить работу');
	await modal.getByLabel('Название работы').fill(`E2E Дубль ${suffix}`);
	await choose(page, 'Позиция каталога', variantLabel);
	await choose(page, 'Роль', 'Столяр');
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(modal.getByTestId('work-type-error')).toContainText('расценка уже есть');
	await expect(modal.getByLabel('Название работы')).toHaveValue(`E2E Дубль ${suffix}`);
});

test('the manager links staff, sees the result of each toggle, rejects duplicates, and detaches it', async ({
	page
}) => {
	await login(page, 'manager');
	await page.goto('/crm/payroll/staff');
	await openModal(page, 'Добавить сотрудника');
	const modal = page.getByTestId('modal');
	await modal.getByLabel('ФИО').fill(workerName);
	await choose(page, 'Учётная запись', accountName);
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(modal).toBeHidden();
	const worker = page.getByTestId('data-table-row').filter({ hasText: workerName });
	await expect(worker.getByTestId('staff-account')).toContainText(accountName);
	await page.getByRole('button', { name: 'Закрыть уведомление' }).click();
	await worker.getByRole('button', { name: 'Выключить', exact: true }).click();
	await expect(worker.getByTestId('directory-status')).toHaveText('Выключен');
	const disabled = page.getByTestId('toast').filter({ hasText: `Выключено: ${workerName}` });
	await expect(disabled).toBeVisible();
	await disabled.getByRole('button', { name: 'Закрыть уведомление' }).click();
	await openModal(page, 'Добавить сотрудника');
	await modal.getByLabel('ФИО').fill(otherName);
	await choose(page, 'Учётная запись', accountName);
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(modal.getByTestId('staff-error')).toContainText('уже связана с другим сотрудником');
	await expect(modal.getByLabel('ФИО')).toHaveValue(otherName);
	await page.keyboard.press('Escape');
	await page
		.getByTestId('toast')
		.filter({ hasText: 'Эта учётная запись уже связана с другим сотрудником' })
		.getByRole('button', { name: 'Закрыть уведомление' })
		.click();
	await worker.getByRole('button', { name: 'Включить', exact: true }).click();
	await expect(worker.getByTestId('directory-status')).toHaveText('Работает');
	const enabled = page.getByTestId('toast').filter({ hasText: `Включено: ${workerName}` });
	await expect(enabled).toBeVisible();
	await enabled.getByRole('button', { name: 'Закрыть уведомление' }).click();
	await worker.getByRole('button', { name: 'Изменить', exact: true }).click();
	await expect(modal.getByLabel('Учётная запись', { exact: true })).toHaveText(accountName);
	await choose(page, 'Учётная запись', 'Без учётной записи');
	await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(modal).toBeHidden();
	await expect(worker.getByTestId('staff-account')).toHaveText('Без учётной записи');
});

test('a workshop worker cannot read choices or post directory changes', async ({ page }) => {
	await login(page, 'carpenter');
	for (const section of ['works', 'staff']) {
		expect((await page.goto(`/crm/payroll/${section}`))?.status()).toBe(403);
		const response = await page.request.post(`/crm/payroll/${section}?/create`, {
			headers: { origin: 'http://localhost:4173' },
			form: {
				fullName: 'Чужой',
				position: '',
				userId: String(userId),
				title: 'Чужая',
				variantId: String(variantId),
				roleCode: 'carpenter',
				rateMinor: '100'
			}
		});
		expect(response.status()).toBe(403);
	}
});

test('the manager creates and edits a laborer salary without a login', async ({ page }) => {
	await login(page, 'manager');
	await page.goto('/crm/payroll/staff');
	await openModal(page, 'Добавить сотрудника');
	const modal = page.getByTestId('modal');
	await modal.getByLabel('ФИО').fill(`${workerName} оклад`);
	await choose(page, 'Роль в выплатах', 'Разнорабочий · месячный оклад');
	await expect(modal.getByLabel('Учётная запись', { exact: true })).toHaveCount(0);
	await expect(modal.locator('input[name=monthlySalaryMinor]')).toHaveValue('6000000');
	await modal.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(modal).toBeHidden();
	const row = page.getByTestId('data-table-row').filter({ hasText: `${workerName} оклад` });
	await expect(row.getByTestId('staff-account')).toHaveText('Без учётной записи');
	await row.getByRole('button', { name: 'Изменить', exact: true }).click();
	await modal.getByLabel('Месячный оклад, ₽').fill('70000');
	await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(modal).toBeHidden();
	await row.getByRole('button', { name: 'Изменить', exact: true }).click();
	await expect(modal.locator('input[name=monthlySalaryMinor]')).toHaveValue('7000000');
});
