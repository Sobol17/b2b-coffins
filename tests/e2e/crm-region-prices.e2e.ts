import ExcelJS from 'exceljs';
import { eq, isNull } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import {
	counterparties,
	priceListItems,
	priceLists,
	products
} from '../../src/lib/server/db/schema';
import { e2eDb } from './transitions';
import { login, logout } from './fixtures';

const ORIGIN = 'http://localhost:4173';
const SKU = 'MDL-201';
const REGION_SHOWN = /9\u00a0500(?![,\d])/;
const OWN_SHOWN = /9\u00a0000(?![,\d])/;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function openModal(page: Page, button: string): Promise<void> {
	await expect(async () => {
		await page.getByRole('button', { name: button }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
}

/** The sheet the workshop uploads: the header row, then one price per article. */
async function regionSheet(): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Прайс');
	sheet.addRow(['Артикул', 'Цена']);
	sheet.addRow([SKU, 9500]);
	return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Download exactly what the UI offers, then upload the same model sheet unchanged. */
async function roundtrip(page: Page, personal: boolean, price: number): Promise<void> {
	const href = await page
		.getByRole('link', { name: 'Скачать Excel', exact: true })
		.getAttribute('href');
	expect(href).toBe(`${new URL(page.url()).pathname}/${personal ? 'prices.xlsx' : 'export.xlsx'}`);
	const response = await page.request.get(href!);
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('spreadsheetml');
	const buffer = await response.body();
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(new Uint8Array(buffer).buffer);
	const rows = workbook.worksheets[0]!.getRows(2, workbook.worksheets[0]!.rowCount - 1)!;
	const model = rows.filter((row) => row.getCell(1).value === SKU);
	expect(model).toHaveLength(1);
	expect(model[0]!.getCell(3).value).toBe(price);
	expect(rows.every((row) => !String(row.getCell(1).value).startsWith(`${SKU}-`))).toBe(true);
	const action = personal ? 'priceImport' : 'import';
	const form = page.locator(`form[action="?/${action}"]`);
	await form
		.locator('input[name="file"]')
		.setInputFiles({ name: 'downloaded.xlsx', mimeType: XLSX_MIME, buffer });
	const uploaded = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			new URL(response.url()).searchParams.has(`/${action}`)
	);
	await form
		.getByRole('button', { name: personal ? 'Загрузить Excel' : 'Загрузить', exact: true })
		.click();
	expect(await (await uploaded).json()).toMatchObject({ type: 'success' });
	await expect(
		page
			.getByTestId('toast')
			.filter({ hasText: personal ? 'Прайс контрагента загружен' : 'Прайс загружен' })
	).toBeVisible();
}

function priceRow(page: Page) {
	return page.getByTestId('data-table-row').filter({ hasText: SKU });
}

function priceField(page: Page) {
	return priceRow(page).getByTestId('personal-price-input').locator('input[type="text"]');
}

async function uploadRegion(page: Page, title: string): Promise<void> {
	await page.goto('/crm/prices');
	await openModal(page, 'Добавить прайс-лист');
	const listForm = page.locator('form[action="?/createList"]');
	await listForm.getByLabel('Название прайс-листа').fill(title);
	await listForm.getByRole('button', { name: 'Добавить', exact: true }).click();
	const listRow = page.getByRole('listitem').filter({ hasText: title });
	await listRow.getByRole('link', { name: `Позиции прайс-листа ${title}`, exact: true }).click();
	await expect(page).toHaveURL(/\/crm\/prices\/\d+$/);

	await page.locator('input[name="file"]').setInputFiles({
		name: 'region.xlsx',
		mimeType: XLSX_MIME,
		buffer: await regionSheet()
	});
	await page.getByRole('button', { name: 'Загрузить', exact: true }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Прайс загружен' })).toBeVisible();
	await expect(priceRow(page)).toContainText(/9\s500/);
	await roundtrip(page, false, 9500);
	await page.reload();
	await expect(priceRow(page)).toContainText(/9\s500/);
}

test('a regional list uploaded from XLSX prefills the prices of a new counterparty', async ({
	page
}) => {
	const suffix = Date.now();
	const region = `Иркутская область — региональный прайс для северных районов ${suffix}`;
	const name = `Агентство региона ${suffix}`;

	await login(page, 'manager');
	await uploadRegion(page, region);

	await page.goto('/crm/counterparties/new');
	await page.locator('input[name="name"]').fill(name);
	await page.getByLabel('Региональный прайс-лист').click();
	await page.getByRole('option', { name: region }).click();
	await page.getByRole('button', { name: 'Завести контрагента', exact: true }).click();
	await expect(page.getByTestId('counterparty-name')).toHaveText(name);

	await page.goto(`${new URL(page.url()).pathname}?priceSearch=MDL-201`);
	await expect(page.getByRole('tab', { name: 'Цены' })).toHaveAttribute('aria-selected', 'true');
	await expect(priceRow(page)).toContainText(REGION_SHOWN);
	await expect(priceField(page)).toHaveValue(REGION_SHOWN);

	await priceField(page).fill('9 000');
	await page.getByRole('button', { name: 'Сохранить цены' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Цены сохранены' })).toBeVisible();
	await expect(priceField(page)).toHaveValue(OWN_SHOWN);
	await roundtrip(page, true, 9000);
	await page.reload();
	await expect(priceField(page)).toHaveValue(OWN_SHOWN);
	const counterpartyId = Number(new URL(page.url()).pathname.split('/').at(-1));
	const before = e2eDb()
		.select()
		.from(counterparties)
		.where(eq(counterparties.id, counterpartyId))
		.get()!;
	const attachment = page.locator('form[action="?/priceList"]');
	expect(
		await attachment.evaluate((form) => [...new FormData(form as HTMLFormElement).keys()])
	).toEqual(['regionPriceListId']);
	await page.setViewportSize({ width: 390, height: 844 });
	await attachment.getByRole('combobox', { name: 'Региональный прайс-лист', exact: true }).click();
	await page.getByRole('option', { name: 'Без прайса', exact: true }).click();
	await attachment.getByRole('button', { name: 'Сохранить привязку' }).click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Привязка прайса сохранена' })
	).toBeVisible();
	await expect(priceField(page)).toHaveValue(OWN_SHOWN);
	await expect(page.getByRole('button', { name: 'Заполнить из прайса' })).toHaveCount(0);
	const detached = e2eDb()
		.select()
		.from(counterparties)
		.where(eq(counterparties.id, counterpartyId))
		.get()!;
	expect(detached).toMatchObject({
		regionPriceListId: null,
		discountPercent: before.discountPercent,
		managerId: before.managerId,
		settlementScheme: before.settlementScheme,
		staffLimit: before.staffLimit,
		priceListId: before.priceListId
	});
	await attachment.getByRole('combobox', { name: 'Региональный прайс-лист', exact: true }).click();
	await page.getByPlaceholder('Поиск по списку', { exact: true }).fill(region);
	await page.getByRole('option', { name: region, exact: true }).click();
	await attachment.getByRole('button', { name: 'Сохранить привязку' }).click();
	await expect(attachment.locator('input[name="regionPriceListId"]')).toHaveValue(
		String(before.regionPriceListId)
	);
	await expect(priceField(page)).toHaveValue(OWN_SHOWN);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);

	await page.getByRole('button', { name: 'Заполнить из прайса' }).click();
	await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Заполнить' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Цены заполнены' })).toBeVisible();
	await expect(priceField(page)).toHaveValue(REGION_SHOWN);
	// The shared logout helper uses the desktop sidebar; the mobile assertions above are complete.
	await page.setViewportSize({ width: 1280, height: 900 });
	await logout(page);
});

test('a full price list explains why adding a model is disabled', async ({ page }) => {
	const db = e2eDb();
	const listId = db.transaction((tx) => {
		const list = tx.insert(priceLists).values({ title: 'Полный прайс' }).returning().get();
		const models = tx
			.select({ id: products.id })
			.from(products)
			.where(isNull(products.deletedAt))
			.all();
		tx.insert(priceListItems)
			.values(models.map(({ id }) => ({ priceListId: list.id, productId: id, priceMinor: 100000 })))
			.run();
		return list.id;
	});
	try {
		await login(page, 'manager');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/crm/prices/${listId}`);
		const add = page.getByRole('button', { name: 'Добавить', exact: true });
		const explanation = 'Все модели уже есть в этом прайсе.';
		await expect(add).toBeDisabled();
		await expect(page.getByText(explanation, { exact: true })).toBeVisible();
		await expect(add).toHaveAccessibleDescription(explanation);

		await page.getByRole('button', { name: 'Удалить', exact: true }).first().click();
		await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Удалить' }).click();
		await expect(add).toBeEnabled();
		await expect(page.getByText(explanation, { exact: true })).toHaveCount(0);
	} finally {
		db.delete(priceLists).where(eq(priceLists.id, listId)).run();
	}
});

test('a driver gets 403 on the upload and on the refill', async ({ page }) => {
	await login(page, 'driver');
	const upload = await page.request.post('/crm/prices/1?/import', {
		headers: { origin: ORIGIN },
		multipart: {
			file: { name: 'region.xlsx', mimeType: XLSX_MIME, buffer: await regionSheet() }
		}
	});
	expect(upload.status()).toBe(403);
	const refill = await page.request.post('/crm/counterparties/1?/refill', {
		headers: { origin: ORIGIN },
		form: {}
	});
	expect(refill.status()).toBe(403);
});
