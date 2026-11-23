import { expect, test, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { products, stockItems } from '../../src/lib/server/db/schema';
import { login, logout } from './fixtures';
import { e2eDb } from './transitions';

// The server render shows the button before hydration wires it, so the click is retried.
async function openModal(page: Page, button: string): Promise<void> {
	await expect(async () => {
		await page.getByRole('button', { name: button }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
}

/** Bits closes tooltips on scroll, so finish scrolling before moving the pointer. */
async function hoverTooltip(page: Page, trigger: Locator, text: string): Promise<void> {
	await trigger.scrollIntoViewIfNeeded();
	await trigger.hover();
	await expect(page.getByRole('tooltip')).toHaveText(text);
}

test('the white variant form searches stock by code and name', async ({ page }) => {
	const db = e2eDb();
	const model = db.select().from(products).where(eq(products.sku, 'MDL-201')).get()!;
	const stockItem = db
		.select()
		.from(stockItems)
		.where(eq(stockItems.code, 'MDL-201-180-PIN'))
		.get()!;
	await login(page, 'owner');
	await page.goto(`/crm/catalog/${model.id}`);
	const form = page.locator('form[action="?/createVariant"]');
	await expect(async () => {
		await page.getByRole('button', { name: 'Добавить вариант', exact: true }).first().click();
		await expect(form).toBeVisible({ timeout: 1000 });
	}).toPass();

	const stock = form.getByRole('combobox', { name: 'Учётная позиция изделия', exact: true });
	await expect(stock).toBeVisible();
	await expect(form.locator('..')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	await stock.click();
	const search = page.getByPlaceholder('Поиск по списку', { exact: true });
	await expect(search).toBeFocused();
	await search.fill(stockItem.code);
	await expect(page.getByRole('option')).toHaveCount(1);
	await search.fill('Волга');
	await page.getByRole('option', { name: `${stockItem.code} · ${stockItem.title}` }).click();
	await expect(form.locator('input[name="stockItemId"]')).toHaveValue(String(stockItem.id));

	await stock.click();
	await search.fill('Без учётной позиции');
	await page.getByRole('option', { name: 'Без учётной позиции', exact: true }).click();
	await expect(form.locator('input[name="stockItemId"]')).toHaveValue('');
});

test('C2 fills and publishes a model through CRM; the portal never receives cost', async ({
	page
}) => {
	const suffix = Date.now();
	const category = `Категория C2 ${suffix}`;
	const title = `Модель C2 ${suffix}`;
	const sku = `C2-${suffix}`;

	await login(page, 'owner');
	await page.goto('/crm/catalog/categories');
	await openModal(page, 'Добавить категорию');
	await page.locator('form[action="?/create"] input[name="title"]').fill(category);
	await page.locator('form[action="?/create"] button[type="submit"]').click();
	await expect(page.getByText(category)).toBeVisible();

	await page.goto('/crm/catalog');
	await openModal(page, 'Добавить модель');
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

	const modelForm = page.locator('form[action="?/update"]');
	await modelForm.getByLabel('Цена модели, ₽').fill('1000');
	await modelForm.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Модель сохранена' })).toBeVisible();

	await page.getByRole('button', { name: 'Добавить вариант' }).click();
	const variant = page.locator('form[action="?/createVariant"]');
	await variant.locator('input[name="sku"]').fill(`${sku}-190`);
	await variant.getByRole('button', { name: 'Размер', exact: true }).click();
	await expect(page.getByRole('option', { name: '50 см (маленький)' })).toBeVisible();
	await page.getByRole('option', { name: '190 см', exact: true }).click();
	await variant.getByRole('button', { name: 'Материал', exact: true }).click();
	await page.getByRole('option').first().click();
	const materialId = await variant.locator('input[name="materialId"]').inputValue();
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
	await openModal(page, 'Добавить прайс-лист');
	const listForm = page.locator('form[action="?/createList"]');
	await listForm.getByLabel('Название прайс-листа').fill(listTitle);
	await listForm.getByRole('button', { name: 'Добавить', exact: true }).click();
	const listRow = page.getByRole('listitem').filter({ hasText: listTitle });
	await expect(listRow).toBeVisible();
	const listLink = listRow.getByRole('link', {
		name: `Позиции прайс-листа ${listTitle}`,
		exact: true
	});
	await expect(listLink).toHaveAttribute('href', /\/crm\/prices\/\d+$/);
	await expect(listRow.getByRole('button', { name: 'Изменить', exact: true })).toHaveText('');
	await hoverTooltip(
		page,
		listRow.getByRole('button', { name: 'Изменить', exact: true }),
		'Изменить прайс-лист'
	);
	await listRow.getByRole('button', { name: 'Изменить', exact: true }).click();
	await expect(page).toHaveURL(/\/crm\/prices$/);
	await expect(page.getByTestId('modal')).toContainText('Изменить прайс-лист');
	await page.getByTestId('modal').getByRole('button', { name: 'Отмена', exact: true }).click();
	await expect(listRow.getByRole('button', { name: 'Удалить', exact: true })).toHaveText('');
	await listRow.getByRole('button', { name: 'Удалить', exact: true }).click();
	await expect(page.getByTestId('confirm-dialog')).toContainText(listTitle);
	await expect(page).toHaveURL(/\/crm\/prices$/);
	await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Отмена' }).click();
	// The title remains a native keyboard link; its stretched area also covers the row's gutter.
	await listLink.focus();
	await expect(listLink).toBeFocused();
	await listRow.click({ position: { x: 4, y: 4 } });
	await expect(page).toHaveURL(/\/crm\/prices\/\d+$/);
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	const itemForm = page.getByTestId('modal').locator('form[action="?/upsert"]');
	await expect(itemForm.getByRole('button', { name: 'Добавить', exact: true })).toBeDisabled();
	await itemForm.getByRole('combobox', { name: 'Изделие', exact: true }).click();
	await expect(page.getByPlaceholder('Поиск по списку')).toBeFocused();
	const modelOptions = page.locator('[data-slot="command-list"]');
	await expect(modelOptions).toBeVisible();
	expect(
		await modelOptions.evaluate((list) => ({
			overflow: getComputedStyle(list).overflowY,
			bounded: list.scrollHeight > list.clientHeight
		}))
	).toEqual({ overflow: 'auto', bounded: true });
	await modelOptions.evaluate((list) => {
		list.scrollTop = list.scrollHeight;
	});
	expect(await modelOptions.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
	await page.getByPlaceholder('Поиск по списку', { exact: true }).fill(sku);
	await page.getByRole('option', { name: `${title} · ${sku}`, exact: true }).click();
	await expect(itemForm.locator('input[name="productId"]')).not.toHaveValue('');
	await expect(itemForm.getByRole('button', { name: 'Добавить', exact: true })).toBeEnabled();
	await expect(itemForm.getByRole('button', { name: 'Добавить', exact: true })).toHaveCSS(
		'cursor',
		'pointer'
	);
	await itemForm.getByLabel('Цена').fill('1100');
	await itemForm.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByTestId('modal')).toBeHidden();
	const priceRow = page.getByTestId('data-table-row').filter({ hasText: sku });
	await expect(priceRow).toContainText(title);
	await expect(priceRow).toContainText(/1\s100/);
	await expect(priceRow.getByRole('button', { name: 'Изменить' })).toHaveText('');
	await hoverTooltip(page, priceRow.getByRole('button', { name: 'Изменить' }), 'Изменить цену');
	await priceRow.getByRole('button', { name: 'Изменить' }).click();
	const editPrice = page.getByTestId('modal');
	await expect(editPrice.getByLabel('Цена')).toHaveValue(/1\s100/);
	await editPrice.getByLabel('Цена').fill('1200');
	await editPrice.getByRole('button', { name: 'Сохранить цену' }).click();
	await expect(editPrice).toBeHidden();
	await expect(priceRow).toContainText(/1\s200/);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(priceRow.getByRole('button', { name: 'Изменить' })).toBeInViewport();
	await priceRow.getByRole('button', { name: 'Удалить' }).click();
	await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Удалить' }).click();
	await expect(priceRow).toHaveCount(0);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/crm/prices');
	await openModal(page, 'Добавить скидку');
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
	await expect(page.getByLabel('Цена модели, ₽')).toHaveValue(/1\s000/);
	// The administrator reads the cost of the stock item on the variant (tech.md v1.62).
	expect(body).toContain('costPriceMinor');
	const saved = await page.request.post(`${productUrl}?/updateVariant`, {
		headers: { origin: 'http://localhost:4173' },
		form: {
			id: variantId,
			sku: `${sku}-190`,
			sizeCode: '190',
			materialId,
			basePriceMinor: '100000',
			stockItemId: '',
			isPublished: 'true'
		}
	});
	expect(await saved.json()).toMatchObject({ type: 'success' });

	await logout(page);
	await login(page, 'cp_admin');
	const storefront = await page.goto('/portal/catalog');
	await expect(page.getByText(category)).toBeVisible();
	expect((await storefront?.text()) ?? '').not.toContain('costPriceMinor');
	await page.getByTestId('showcase-tile').filter({ hasText: title }).click();
	await page.getByRole('button', { name: 'Блеск', exact: true }).click();
	await page.getByRole('option', { name: 'Глянцевый', exact: true }).click();
	await page.getByTestId('add-to-draft').click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Позиция добавлена в заявку' })
	).toBeVisible();
	await page.goto('/portal/cart');
	await expect(page.getByTestId('draft-line').filter({ hasText: title })).toContainText(
		'Глянцевый'
	);
	await page.getByRole('button', { name: 'Очистить' }).click();
	expect((await page.goto('/crm/catalog'))?.status()).toBe(403);
	await page.goto('/portal/profile');
	await logout(page);
	await login(page, 'owner');
	await page.goto(productUrl);
	await page.locator('form[action="?/publish"]').getByRole('button', { name: 'Скрыть' }).click();
	await expect(page.getByText('Скрыта в портале')).toBeVisible();
});
