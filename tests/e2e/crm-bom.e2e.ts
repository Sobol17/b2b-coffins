import { eq } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import { bomVersions, stockItems, stockMoves } from '../../src/lib/server/db/schema';
import { BOM_FILE_COLUMNS } from '../../src/lib/types/crm-bom';
import { parseMilli } from '../../src/lib/utils/milli';
import { enterRequest } from './crm-flow';
import { login, purchaseMoneyKeys } from './fixtures';
import { e2eDb, stockUp } from './transitions';

const ORIGIN = 'http://localhost:4173';
// Mahogany is left to this spec: the others order walnut, black, wenge and white.
const COLOUR = 'Красное дерево';
const VOLGA = ['MDL-201-180-PIN', 'MDL-201-190-PIN', 'MDL-201-200-PIN'];

function file(rows: readonly (readonly string[])[]) {
	const text = [BOM_FILE_COLUMNS, ...rows].map((row) => row.join(';')).join('\r\n');
	return { name: 'norms.csv', mimeType: 'text/csv', buffer: Buffer.from(text) };
}

const CLEAN = file(
	VOLGA.flatMap((sku) => [
		[sku, 'CMP-LACQUER', '0,5'],
		[sku, 'CMP-BOARD-PINE', '2']
	])
);
const BROKEN = file([
	[VOLGA[0] ?? '', 'CMP-LACQUER', '0,5'],
	['MDL-NONE', 'CMP-LACQUER', 'много']
]);

function stockItemId(code: string): number {
	const [row] = e2eDb().select().from(stockItems).where(eq(stockItems.code, code)).all();
	if (!row) throw new Error(`stock item ${code} is not seeded`);
	return row.id;
}

/** Norms and what they wrote off: the other specs count on shelves this spec never touched. */
function clean(): void {
	const db = e2eDb();
	db.delete(stockMoves).where(eq(stockMoves.type, 'consumption')).run();
	db.delete(bomVersions).run();
}

async function upload(page: Page, payload: ReturnType<typeof file>): Promise<void> {
	await page.goto('/crm/stock/norms/import');
	// A file chosen before hydration fires no handler: repeat until the preview opens.
	await expect(async () => {
		await page.locator('input[type="file"]').setInputFiles(payload);
		await expect(page).toHaveURL(/norms\/import\?file=\d+$/, { timeout: 2000 });
	}).toPass();
}

/** Need of the lacquer on the deficit list in thousandths, zero when the row is absent. */
async function lacquerNeed(page: Page): Promise<number> {
	await page.goto('/crm/stock/deficit');
	const row = page.getByRole('row').filter({ hasText: 'CMP-LACQUER' });
	if ((await row.count()) === 0) return 0;
	const text = (await row.getByRole('cell').nth(1).innerText()).replace(/[^\d,]/g, '');
	return parseMilli(text) ?? 0;
}

async function markMade(page: Page, number: string, qty: number): Promise<void> {
	await page.goto(`/crm/shop?q=${encodeURIComponent(number)}`);
	const row = page
		.getByTestId('shop-queue-row')
		.filter({ hasText: 'Модель «Волга»' })
		.filter({ hasText: COLOUR });
	await expect(async () => {
		await row.getByLabel('Штук').fill(String(qty));
		await row.getByRole('button', { name: 'Сделано' }).click();
		await expect(page.getByText('Выпуск отмечен').first()).toBeVisible({ timeout: 2000 });
	}).toPass();
}

test.beforeAll(clean);
test.afterAll(clean);

test('C9 DoD: a file makes a version, a mark writes components off, the deficit is listed', async ({
	page
}) => {
	await login(page, 'manager');
	const lacquer = stockItemId('CMP-LACQUER');

	// A file with a broken row is reported and cannot be imported.
	await upload(page, BROKEN);
	await expect(page.getByTestId('bom-preview-summary')).toContainText('2 строки, с ошибками 1');
	await expect(page.getByTestId('bom-row-errors').first()).toContainText('Артикула нет в каталоге');
	await expect(page.getByTestId('bom-row-errors').first()).toContainText('Норма не число');
	await expect(page.getByRole('button', { name: 'Импортировать' })).toHaveCount(0);

	// The clean file becomes the active version through the queue.
	await upload(page, CLEAN);
	await expect(page.getByTestId('bom-preview-summary')).toContainText('6 строк, с ошибками 0');
	await page.getByRole('button', { name: 'Импортировать' }).click();
	await expect(page).toHaveURL(/\/crm\/stock\/norms\?import=\d+$/);
	await expect(async () => {
		await page.reload();
		await expect(page.getByTestId('bom-import-state')).toContainText('Файл импортирован', {
			timeout: 1000
		});
	}).toPass({ timeout: 20_000 });
	await expect(page.getByTestId('bom-version')).toHaveCount(1);
	await expect(page.getByTestId('bom-version')).toContainText('Активна');
	await expect(page.getByTestId('bom-version')).toContainText('6 норм');
	await expect(page.getByTestId('norm-qty')).toHaveText(VOLGA.flatMap(() => ['2 м2', '0,5 л']));
	// The norms draw no money even for a role that may see it.
	expect(purchaseMoneyKeys(await page.content())).toEqual([]);

	// A request in work raises the need by its missing pieces times the norm.
	const before = await lacquerNeed(page);
	const number = await enterRequest(page, `Нормов Нил ${Date.now()}`, COLOUR, 3);
	await page.getByRole('button', { name: 'Принять в работу' }).click();
	await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'В работе' })).toBeVisible();
	expect(await lacquerNeed(page)).toBe(before + 1500);
	await expect(
		page.getByRole('row').filter({ hasText: 'CMP-LACQUER' }).getByTestId('deficit-qty')
	).toBeVisible();

	// Loadings of earlier runs may have left the position in the red: level it three pieces short.
	stockUp(e2eDb(), number, 3);
	// Three pieces take 1,5 l: one whole litre leaves the shelf, the half carries on.
	await markMade(page, number, 3);
	await page.goto(`/crm/stock/${lacquer}`);
	const journal = page.getByRole('row').filter({ hasText: 'Списание по норме' });
	await expect(journal).toHaveCount(1);
	await expect(journal.getByTestId('move-qty')).toHaveText('-1');
	await expect(journal).toContainText('по норме 1,5');
	await expect(journal.getByRole('button', { name: 'Сторнировать' })).toHaveCount(0);
	await page.goto(`/crm/stock/${stockItemId('CMP-BOARD-PINE')}`);
	await expect(
		page.getByRole('row').filter({ hasText: 'Списание по норме' }).getByTestId('move-qty')
	).toHaveText('-6');
	expect(await lacquerNeed(page)).toBe(before);

	// A changed norm leaves the written move as it was.
	await page.goto('/crm/stock/norms?search=MDL-201-180-PIN');
	const norm = page.getByRole('row').filter({ hasText: 'CMP-LACQUER' });
	await expect(async () => {
		await norm.getByRole('button', { name: 'Изменить' }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByTestId('modal').getByLabel('Норма на единицу').fill('0,25');
	await page.getByRole('button', { name: 'Сохранить норму' }).click();
	await expect(page.getByText('Норма изменена').first()).toBeVisible();
	await expect(norm.getByTestId('norm-qty')).toHaveText('0,25 л');
	await page.goto(`/crm/stock/${lacquer}`);
	await expect(journal).toHaveCount(1);
	await expect(journal).toContainText('по норме 1,5');
});

test('C9: a version is made by hand, an old one comes back and stays read-only', async ({
	page
}) => {
	await login(page, 'manager');
	await page.goto('/crm/stock/norms');
	const versions = page.getByTestId('bom-version');
	const count = await versions.count();

	// Two versions by hand: the second is active, the first is history.
	for (const made of [1, 2]) {
		await expect(async () => {
			await page.getByRole('button', { name: 'Новая версия' }).click();
			await expect(versions).toHaveCount(count + made, { timeout: 2000 });
		}).toPass();
	}
	await expect(versions.first()).toContainText('Активна');
	await expect(versions.first()).toContainText('вручную');
	await expect(page.getByRole('button', { name: 'Добавить норму' })).toBeVisible();

	await versions.nth(1).getByRole('link', { name: 'Открыть' }).click();
	await expect(page).toHaveURL(/version=\d+/);
	await expect(page.getByText('Прежняя версия, только чтение.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Добавить норму' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Изменить' })).toHaveCount(0);
	await versions.nth(1).getByRole('button', { name: 'Сделать активной' }).click();
	await expect(versions.nth(1)).toContainText('Активна');
	await expect(page.getByRole('button', { name: 'Добавить норму' })).toBeVisible();
});

test('C9: a reader sees the norms and the server refuses every write without stock.manage', async ({
	page
}) => {
	await login(page, 'carpenter');
	expect((await page.goto('/crm/stock/norms'))?.status()).toBe(200);
	await expect(page.getByRole('button', { name: 'Новая версия' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Импорт из файла' })).toHaveCount(0);
	expect((await page.goto('/crm/stock/deficit'))?.status()).toBe(200);
	expect((await page.goto('/crm/stock/norms/import'))?.status()).toBe(403);

	// An action posted as JSON answers HTTP 200 and carries the failure status in the body.
	const post = (action: string, form: Record<string, string>) =>
		page.request.post(`/crm/stock/norms?/${action}`, {
			headers: { origin: ORIGIN, accept: 'application/json' },
			form
		});
	for (const [action, form] of [
		['createVersion', {}],
		['activate', { versionId: '1' }],
		['normCreate', { variantId: '1', componentId: '1', qtyPerUnitMilli: '1' }],
		['normUpdate', { normId: '1', qtyPerUnitMilli: '1' }],
		['normDelete', { normId: '1' }]
	] as const) {
		expect(await (await post(action, form)).json()).toMatchObject({ type: 'failure', status: 403 });
	}
	const forgedUpload = await page.request.post('/api/files', {
		headers: { origin: ORIGIN, 'x-requested-with': 'XMLHttpRequest' },
		multipart: { bomImport: '1', file: CLEAN }
	});
	expect(forgedUpload.status()).toBe(403);
});

test('C9: the driver and the portal get 403 on the norms and the deficit', async ({ page }) => {
	await login(page, 'driver');
	for (const path of ['/crm/stock/norms', '/crm/stock/norms/import', '/crm/stock/deficit']) {
		expect((await page.goto(path))?.status()).toBe(403);
	}
	const forged = await page.request.post('/crm/stock/norms?/activate', {
		headers: { origin: ORIGIN },
		form: { versionId: '1' }
	});
	expect(forged.status()).toBe(403);
	await page.context().clearCookies();

	await login(page, 'cp_admin');
	expect((await page.goto('/crm/stock/norms'))?.status()).toBe(403);
	expect((await page.goto('/crm/stock/deficit'))?.status()).toBe(403);
});
