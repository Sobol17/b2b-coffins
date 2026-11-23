import { and, eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import {
	dictItems,
	productVariants,
	products,
	stockItems,
	stockMoves
} from '../../src/lib/server/db/schema';
import { login } from './fixtures';
import { e2eDb } from './transitions';

test.use({ viewport: { width: 390, height: 844 } });

const ORIGIN = 'http://localhost:4173';

test('stock registry groups model sizes and opens the actual accounting card', async ({ page }) => {
	await login(page, 'manager');
	const variant = e2eDb()
		.select()
		.from(productVariants)
		.where(eq(productVariants.sku, 'MDL-201-180-PIN'))
		.get()!;
	const product = e2eDb().select().from(products).where(eq(products.id, variant.productId)).get()!;
	const variants = e2eDb()
		.select()
		.from(productVariants)
		.where(eq(productVariants.productId, product.id))
		.all();
	await page.goto(`/crm/stock?search=${encodeURIComponent(variant.sku)}`);
	const row = page.getByTestId('data-table-row');
	await expect(row).toHaveCount(1);
	const toggle = row.getByRole('button', { name: product.title });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.focus();
	await toggle.press('Enter');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	for (const member of variants) {
		await expect(row.locator(`a[href="/crm/stock/${member.stockItemId}"]`)).toBeVisible();
	}
	await expect(row.getByRole('button', { name: 'Изменить', exact: true })).toHaveCount(
		variants.length
	);
	await toggle.press('Space');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	for (const member of variants) {
		await expect(row.locator(`a[href="/crm/stock/${member.stockItemId}"]`)).not.toBeVisible();
	}
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await row.locator(`a[href="/crm/stock/${variant.stockItemId}"]`).click();
	await expect(page).toHaveURL(`/crm/stock/${variant.stockItemId}`);
	await expect(page.getByRole('button', { name: 'Сохранить позицию' })).toBeVisible();
});

test('stock model disclosure respects reduced motion while keeping pointer controls usable', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await login(page, 'manager');
	await page.goto('/crm/stock?search=MDL-201-180-PIN');
	const row = page.getByTestId('data-table-row');
	const toggle = row.getByRole('button', { name: 'Модель «Волга»' });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	const panelId = await toggle.getAttribute('aria-controls');
	expect(panelId).toBeTruthy();
	const panel = page.locator(`[id="${panelId}"]`);
	await expect(panel.getByRole('link').first()).toBeVisible();
	for (const locator of [toggle, panel]) {
		expect(
			await locator.evaluate(
				(node) =>
					node
						.getAnimations({ subtree: true })
						.filter((animation) => animation.playState === 'running').length
			)
		).toBe(0);
	}
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(panel.getByRole('link')).toHaveCount(0);
});

test('registry edits and archives a position while preserving its history card', async ({
	page
}) => {
	await login(page, 'manager');
	const code = `REGISTRY-${Date.now()}`;
	const unit = e2eDb()
		.select()
		.from(dictItems)
		.where(and(eq(dictItems.dict, 'unit'), eq(dictItems.code, 'pcs')))
		.get()!;
	const item = e2eDb()
		.insert(stockItems)
		.values({ kind: 'component', code, title: code, unitId: unit.id })
		.returning()
		.get()!;
	const id = item.id;
	await page.goto(`/crm/stock?search=${code}`);
	await expect(async () => {
		await page.getByRole('button', { name: 'Изменить', exact: true }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByTestId('modal').getByLabel('Название').fill(`Обновлена ${code}`);
	await page.getByTestId('modal').getByRole('button', { name: 'Сохранить позицию' }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
	await expect(page.getByRole('link', { name: `Обновлена ${code}`, exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Удалить', exact: true }).click();
	await page
		.getByTestId('confirm-dialog')
		.getByRole('button', { name: 'Удалить', exact: true })
		.click();
	await expect(page.getByTestId('data-table-row')).toHaveCount(0);
	await page.goto(`/crm/stock/${id}`);
	await expect(page.getByText('Удалена', { exact: false })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Движение', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Сохранить позицию' })).toHaveCount(0);
	const forged = await page.request.post(`/crm/stock/${id}?/move`, {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { type: 'purchase', qty: '1' }
	});
	expect(await forged.json()).toMatchObject({ type: 'failure', status: 409 });
});

test('a model is archived after one confirmation only when all of its stock is free', async ({
	page
}) => {
	await login(page, 'manager');
	const db = e2eDb();
	const code = `ARCHIVE-MODEL-${Date.now()}`;
	const unit = db
		.select()
		.from(dictItems)
		.where(and(eq(dictItems.dict, 'unit'), eq(dictItems.code, 'pcs')))
		.get()!;
	const material = db.select().from(dictItems).where(eq(dictItems.dict, 'material')).get()!;
	const model = db
		.insert(products)
		.values({ sku: code, title: code, isPublished: true })
		.returning()
		.get()!;
	const ids = ['180', '190'].map((sizeCode) => {
		const sku = `${code}-${sizeCode}`;
		const item = db
			.insert(stockItems)
			.values({ kind: 'product', code: sku, title: sku, unitId: unit.id })
			.returning()
			.get()!;
		db.insert(productVariants)
			.values({
				productId: model.id,
				sku,
				sizeCode,
				materialId: material.id,
				stockItemId: item.id,
				isPublished: true
			})
			.run();
		return item.id;
	});
	const [stockId] = ids;
	db.insert(stockMoves)
		.values({ stockItemId: stockId!, qty: 1, type: 'purchase', occurredAt: new Date() })
		.run();
	await page.goto(`/crm/stock?search=${code}`);
	const row = page.getByTestId('data-table-row').filter({ hasText: code });
	const remove = row.getByRole('button', { name: 'Удалить', exact: true });
	await expect(remove).toBeVisible();
	await remove.click();
	const dialog = page.getByTestId('confirm-dialog');
	await expect(dialog).toContainText('Изделие со всеми размерами');
	await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
	await expect(row).toBeVisible();

	await remove.click();
	await dialog.getByRole('button', { name: 'Удалить', exact: true }).click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Есть остаток по позиции' })
	).toBeVisible();
	await expect(dialog).toBeHidden();
	await expect(row).toBeVisible();
	expect(db.select().from(products).where(eq(products.id, model.id)).get()?.deletedAt).toBeNull();

	db.insert(stockMoves)
		.values({ stockItemId: stockId!, qty: -1, type: 'adjustment', occurredAt: new Date() })
		.run();
	await remove.click();
	await dialog.getByRole('button', { name: 'Удалить', exact: true }).click();
	await expect(row).toHaveCount(0);
	expect(
		db.select().from(products).where(eq(products.id, model.id)).get()?.deletedAt
	).toBeInstanceOf(Date);
	await page.goto(`/crm/stock/${stockId}`);
	await expect(page.getByText('Удалена', { exact: false })).toBeVisible();
	expect(
		db.select().from(stockMoves).where(eq(stockMoves.stockItemId, stockId!)).all()
	).toHaveLength(2);
});
