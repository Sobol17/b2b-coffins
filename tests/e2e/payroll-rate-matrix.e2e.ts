import { eq, inArray } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import { dictItems, products, productVariants, workTypes } from '../../src/lib/server/db/schema';
import { login } from './fixtures';
import { e2eDb } from './transitions';

const mark = `E2E-RATE-MATRIX-${Date.now()}`;
const model = `${mark} Ёлка`;
let productId: number;
let extraProductIds: number[] = [];
let variantIds: number[] = [];
let workIds: number[] = [];

test.beforeAll(() => {
	const db = e2eDb();
	const material = db.select().from(dictItems).where(eq(dictItems.dict, 'material')).get()!;
	productId = db.insert(products).values({ sku: mark, title: model }).returning().get()!.id;
	extraProductIds = db
		.insert(products)
		.values(
			Array.from({ length: 23 }, (_, index) => ({
				sku: `${mark}-model-${index}`,
				title: `${mark} Позиция ${index}`
			}))
		)
		.returning({ id: products.id })
		.all()
		.map((row) => row.id);
	variantIds = db
		.insert(productVariants)
		.values([
			{ productId, sku: `${mark} елка`, sizeCode: '180', materialId: material.id },
			{ productId, sku: `${mark}-200`, sizeCode: '200', materialId: material.id },
			...Array.from({ length: 23 }, (_, index) => ({
				productId: extraProductIds[index]!,
				sku: `${mark}-extra-${index}`,
				sizeCode: String(210 + index),
				materialId: material.id
			}))
		])
		.returning({ id: productVariants.id })
		.all()
		.map((row) => row.id);
	workIds = db
		.insert(workTypes)
		.values([
			{
				title: `${mark} Столяр`,
				variantId: variantIds[0]!,
				roleCode: 'carpenter',
				rateMinor: 0,
				isActive: true
			},
			{
				title: `${mark} Маляр`,
				variantId: variantIds[0]!,
				roleCode: 'painter',
				rateMinor: 25000,
				isActive: false
			},
			{ title: `${mark} Дополнительная работа`, roleCode: null, rateMinor: 5000, isActive: true }
		])
		.returning({ id: workTypes.id })
		.all()
		.map((row) => row.id);
});

test.afterAll(() => {
	const db = e2eDb();
	db.delete(workTypes).where(inArray(workTypes.id, workIds)).run();
	db.delete(productVariants).where(inArray(productVariants.id, variantIds)).run();
	db.delete(products)
		.where(inArray(products.id, [productId, ...extraProductIds]))
		.run();
});

test('rates are searchable by position and keep zero, missing and disabled states separate', async ({
	page
}) => {
	await login(page, 'manager');
	await page.goto('/crm/payroll/works');
	const search = page.getByRole('searchbox', { name: 'Поиск по работам и позициям' });
	await search.fill(`${mark} елка`);
	await page.getByRole('button', { name: 'Найти', exact: true }).click();
	const row = page.getByTestId('data-table-row').filter({ hasText: `${mark} ·` });
	await expect(row).toHaveCount(1);
	const carpenter = row
		.getByTestId('work-rate-cell')
		.filter({ has: page.getByRole('button', { name: /Изменить: Столяр/ }) });
	const painter = row
		.getByTestId('work-rate-cell')
		.filter({ has: page.getByRole('button', { name: /Изменить: Маляр/ }) });
	await expect(carpenter.getByTestId('work-rate')).toHaveText('0 ₽');
	await expect(painter.getByTestId('directory-status')).toHaveText('Выключена');
	await expect(row.getByTestId('work-rate-missing')).toHaveCount(2);
	await painter.getByRole('button').click();
	await page
		.getByTestId('modal')
		.getByRole('button', { name: 'Включить работу', exact: true })
		.click();
	await expect(painter.getByTestId('directory-status')).toHaveCount(0);
	await painter.getByRole('button').click();
	await page
		.getByTestId('modal')
		.getByRole('button', { name: 'Выключить работу', exact: true })
		.click();
	await expect(painter.getByTestId('directory-status')).toHaveText('Выключена');
	await carpenter.getByRole('button').click();
	const modal = page.getByTestId('modal');
	await expect(modal).toBeVisible();
	await expect(modal.getByLabel('Стоимость за единицу, ₽')).toHaveValue('0');
	await modal.getByLabel('Стоимость за единицу, ₽').fill('10');
	await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(modal).toBeHidden();
	await expect(carpenter.getByTestId('work-rate')).toHaveText('10 ₽');
	await search.fill(`${mark} елка`);
	await page.getByRole('button', { name: 'Найти', exact: true }).click();
	const withoutRates = page.getByTestId('data-table-row').filter({ hasText: `${mark} ·` });
	await expect(withoutRates).toHaveCount(1);
	await expect(withoutRates.getByTestId('work-rate-missing')).toHaveCount(2);
	await page.getByRole('tab', { name: 'Дополнительные работы', exact: true }).click();
	await search.fill(`${mark} Дополнительная работа`);
	await page.getByRole('button', { name: 'Найти', exact: true }).click();
	await expect(page.getByTestId('data-table-row')).toHaveCount(1);
	await expect(page.getByTestId('directory-name')).toHaveText(`${mark} Дополнительная работа`);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('tab', { name: 'Расценки позиций', exact: true }).click();
	await search.fill(`${mark} елка`);
	await page.getByRole('button', { name: 'Найти', exact: true }).click();
	await expect(carpenter.getByTestId('work-rate')).toBeVisible();
	await expect(painter.getByTestId('directory-status')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('position pagination keeps search and supports 7, 20 and 50 rows', async ({ page }) => {
	await login(page, 'manager');
	await page.goto(`/crm/payroll/works?search=${mark}`);
	const matrix = page
		.getByTestId('data-table-row')
		.filter({ has: page.getByTestId('work-variant') });
	await expect(matrix).toHaveCount(7);
	await page.getByRole('button', { name: 'Следующая страница' }).click();
	await expect(matrix).toHaveCount(7);
	await expect(page).toHaveURL(/page=2/);
	for (const size of ['20', '50']) {
		await page.getByLabel('Строк на странице', { exact: true }).click();
		await page.getByRole('option', { name: size, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`perPage=${size}`));
		await expect(matrix).toHaveCount(Number(size) === 20 ? 20 : 24);
	}
	await page.getByRole('searchbox').fill(`${mark} елка`);
	await page.getByRole('button', { name: 'Найти', exact: true }).click();
	await expect(matrix).toHaveCount(1);
	await expect(page).not.toHaveURL(/page=2/);
});
