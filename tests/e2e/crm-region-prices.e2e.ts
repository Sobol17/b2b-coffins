import ExcelJS from 'exceljs';
import { expect, test, type Page } from '@playwright/test';
import { login, logout } from './fixtures';

const ORIGIN = 'http://localhost:4173';
const SKU = 'MDL-201-180-PIN';
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
	await listRow.getByRole('link', { name: 'Позиции' }).click();
	await expect(page).toHaveURL(/\/crm\/prices\/\d+$/);

	await page.locator('input[name="file"]').setInputFiles({
		name: 'region.xlsx',
		mimeType: XLSX_MIME,
		buffer: await regionSheet()
	});
	await page.getByRole('button', { name: 'Загрузить', exact: true }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Прайс загружен' })).toBeVisible();
	await expect(page.getByText(`${SKU} · 9 500`)).toBeVisible();
}

test('a regional list uploaded from XLSX prefills the prices of a new counterparty', async ({
	page
}) => {
	const suffix = Date.now();
	const region = `Иркутская область ${suffix}`;
	const name = `Агентство региона ${suffix}`;

	await login(page, 'manager');
	await uploadRegion(page, region);

	await page.goto('/crm/counterparties/new');
	await page.locator('input[name="name"]').fill(name);
	await page.locator('input[name="adminFullName"]').fill('Ирина Регионова');
	// global-setup disables e2e.* accounts, so reruns never pile up active seats.
	await page.locator('input[name="adminEmail"]').fill(`e2e.region.${suffix}@agency.example`);
	await page.getByLabel('Региональный прайс-лист').click();
	await page.getByRole('option', { name: region }).click();
	await page.getByRole('button', { name: 'Завести и отправить доступ' }).click();
	await page.getByRole('link', { name: 'Открыть карточку контрагента' }).click();
	await expect(page.getByTestId('counterparty-name')).toHaveText(name);

	await page.goto(`${new URL(page.url()).pathname}?priceSearch=MDL-201-180`);
	await expect(page.getByRole('tab', { name: 'Цены' })).toHaveAttribute('aria-selected', 'true');
	await expect(priceRow(page)).toContainText(REGION_SHOWN);
	await expect(priceField(page)).toHaveValue(REGION_SHOWN);

	await priceField(page).fill('9 000');
	await page.getByRole('button', { name: 'Сохранить цены' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Цены сохранены' })).toBeVisible();
	await expect(priceField(page)).toHaveValue(OWN_SHOWN);

	await page.getByRole('button', { name: 'Заполнить из прайса' }).click();
	await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Заполнить' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Цены заполнены' })).toBeVisible();
	await expect(priceField(page)).toHaveValue(REGION_SHOWN);
	await logout(page);
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
