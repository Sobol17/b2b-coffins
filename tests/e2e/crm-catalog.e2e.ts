import { expect, test } from '@playwright/test';
import { login, logout } from './fixtures';

test('C2 fills and publishes a model through CRM; manager never receives cost', async ({
	page
}) => {
	const suffix = Date.now();
	const category = `Категория C2 ${suffix}`;
	const title = `Модель C2 ${suffix}`;
	const sku = `C2-${suffix}`;

	await login(page, 'owner');
	await page.goto('/crm/catalog/categories');
	await page.locator('form[action="?/create"] input[name="title"]').fill(category);
	await page.locator('form[action="?/create"] button[type="submit"]').click();
	await expect(page.getByText(category)).toBeVisible();

	await page.goto('/crm/catalog');
	const create = page.locator('form[action="?/create"]');
	await create.locator('input[name="sku"]').fill(sku);
	await create.locator('input[name="title"]').fill(title);
	await create.locator('[data-slot="select-trigger"]').click();
	await page.getByRole('option', { name: category }).click();
	await create.getByRole('button', { name: 'Добавить модель' }).click();
	const row = page.getByTestId('data-table-row').filter({ hasText: sku });
	await expect(row).toContainText(title);
	await row.getByRole('link', { name: 'Открыть' }).click();
	await expect(page).toHaveURL(/\/crm\/catalog\/\d+$/);
	const productUrl = new URL(page.url()).pathname;

	await page.getByRole('button', { name: 'Добавить вариант' }).click();
	const variant = page.locator('form[action="?/createVariant"]');
	await variant.locator('input[name="sku"]').fill(`${sku}-190`);
	await variant.locator('input[name="sizeCode"]').fill('190');
	await variant.locator('[data-slot="select-trigger"]').first().click();
	await page.getByRole('option').first().click();
	await variant.getByLabel('Базовая цена').fill('1000');
	await variant.getByLabel('Себестоимость').fill('500');
	await variant.getByRole('button', { name: 'Добавить вариант' }).click();
	await expect(page.getByText(`${sku}-190`)).toBeVisible();
	const variantId = await page
		.locator('form[action="?/variantStatus"] input[name="id"]')
		.inputValue();
	await page
		.locator('form[action="?/variantStatus"]')
		.getByRole('button', { name: 'Опубликовать' })
		.click();
	await page
		.locator('form[action="?/publish"]')
		.getByRole('button', { name: 'Опубликовать' })
		.click();
	await expect(page.getByText('Опубликована в портале')).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles({
		name: 'cover.png',
		mimeType: 'image/png',
		buffer: Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
			'base64'
		)
	});
	await expect(page.getByText('Обложка')).toBeVisible();
	await page.goto('/crm/prices');
	const listTitle = `Прайс C2 ${suffix}`;
	const listForm = page.locator('form[action="?/createList"]');
	await listForm.getByLabel('Название прайс-листа').fill(listTitle);
	await listForm.getByRole('button', { name: 'Добавить', exact: true }).click();
	const listRow = page.getByRole('listitem').filter({ hasText: listTitle });
	await expect(listRow).toBeVisible();
	await listRow.getByRole('link', { name: 'Позиции' }).click();
	await expect(page).toHaveURL(/\/crm\/prices\/\d+$/);
	const itemForm = page.locator('form[action="?/upsert"]');
	await itemForm.locator('[data-slot="select-trigger"]').click();
	await page.getByRole('option', { name: new RegExp(`${sku}-190`) }).click();
	await itemForm.getByLabel('Цена').fill('1100');
	await itemForm.getByRole('button', { name: 'Сохранить цену' }).click();
	await expect(page.getByText(`${sku}-190 · 1 100`)).toBeVisible();
	await page.goto('/crm/prices');
	const ruleForm = page.locator('form[action="?/createRule"]');
	await ruleForm.locator('[data-slot="select-trigger"]').nth(1).click();
	await page.getByRole('option', { name: category }).click();
	await ruleForm.getByLabel('Скидка, %').fill('7');
	await ruleForm.getByRole('button', { name: 'Добавить правило' }).click();
	await expect(page.getByText('7 %')).toBeVisible();

	await logout(page);
	await login(page, 'manager');
	const response = await page.goto(productUrl);
	const body = (await response?.text()) ?? '';
	expect(body).not.toContain('costPriceMinor');
	expect(body).not.toContain('50000');
	const forged = await page.request.post(`${productUrl}?/updateVariant`, {
		headers: { origin: 'http://localhost:4173' },
		form: {
			id: variantId,
			sku: `${sku}-190`,
			sizeCode: '190',
			materialId: '1',
			basePriceMinor: '100000',
			costPriceMinor: '100',
			stockItemId: '',
			isPublished: 'true'
		}
	});
	expect(await forged.json()).toMatchObject({ type: 'failure', status: 403 });

	await logout(page);
	await login(page, 'cp_admin');
	await page.goto('/portal/catalog');
	await expect(page.getByText(category)).toBeVisible();
	expect((await page.goto('/crm/catalog'))?.status()).toBe(403);
	await page.goto('/portal/profile');
	await logout(page);
	await login(page, 'owner');
	await page.goto(productUrl);
	await page.locator('form[action="?/publish"]').getByRole('button', { name: 'Скрыть' }).click();
	await expect(page.getByText('Скрыта в портале')).toBeVisible();
});
