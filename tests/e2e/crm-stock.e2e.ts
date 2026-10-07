import { eq, inArray, like } from 'drizzle-orm';
import { expect, test, type Page } from '@playwright/test';
import {
	inventories,
	inventoryLines,
	stockItems,
	stockMoves
} from '../../src/lib/server/db/schema';
import { crmNavLink, login, purchaseMoneyKeys } from './fixtures';
import { e2eDb } from './transitions';

const ORIGIN = 'http://localhost:4173';

/** A Select of the kit: the trigger carries the label, the options live in a portal. */
async function choose(page: Page, label: string, option: string): Promise<void> {
	const item = page.getByRole('option', { name: option, exact: true });
	// A click before hydration lands on the server markup: repeat until the list opens.
	await expect(async () => {
		await page.getByTestId('modal').getByLabel(label).click();
		await expect(item).toBeVisible({ timeout: 1000 });
	}).toPass();
	await item.click();
}

/** A component of its own: the other specs keep counting the seeded shelf. */
async function newItem(page: Page, threshold: number): Promise<string> {
	const code = `E2E-${Date.now()}`;
	await page.goto('/crm/stock');
	await expect(async () => {
		await page.getByRole('button', { name: 'Новая позиция' }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	const modal = page.getByTestId('modal');
	await modal.getByLabel('Код').fill(code);
	await modal.getByLabel('Название').fill(`Гвозди ${code}`);
	await choose(page, 'Единица', 'шт');
	await modal.getByLabel('Минимальный порог').fill(String(threshold));
	await modal.getByRole('button', { name: 'Завести позицию' }).click();
	await expect(page).toHaveURL(/\/crm\/stock\/\d+$/);
	await expect(page.getByTestId('stock-title')).toHaveText(`Гвозди ${code}`);
	return code;
}

async function openMove(page: Page): Promise<void> {
	await expect(async () => {
		await page.getByRole('button', { name: 'Движение', exact: true }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
}

async function purchase(page: Page, qty: number): Promise<void> {
	await openMove(page);
	await page.getByTestId('modal').getByLabel('Количество').fill(String(qty));
	await page.getByRole('button', { name: 'Записать движение' }).click();
	await expect(page.getByText('Движение записано').first()).toBeVisible();
	await expect(page.getByTestId('modal')).toHaveCount(0);
}

async function writeOff(page: Page, qty: number): Promise<void> {
	await openMove(page);
	await choose(page, 'Тип', 'Корректировка');
	await page.getByTestId('modal').getByText('Списать').click();
	await page.getByTestId('modal').getByLabel('Количество').fill(String(qty));
	await choose(page, 'Причина', 'Корректировка учёта');
	await page.getByRole('button', { name: 'Записать движение' }).click();
	await expect(page.getByTestId('modal')).toHaveCount(0);
}

const balance = (page: Page) => page.getByTestId('stock-card-balance');
const itemId = (page: Page) => new URL(page.url()).pathname.split('/').at(-1) ?? '';

// The file outlives a run: items of earlier runs would pile up in the registry and in every draft.
test.beforeAll(() => {
	const db = e2eDb();
	const stale = db
		.select({ id: stockItems.id })
		.from(stockItems)
		.where(like(stockItems.code, 'E2E-%'))
		.all()
		.map((row) => row.id);
	if (stale.length === 0) return;
	db.delete(inventoryLines).where(inArray(inventoryLines.stockItemId, stale)).run();
	db.delete(stockMoves).where(inArray(stockMoves.stockItemId, stale)).run();
	db.delete(stockItems).where(inArray(stockItems.id, stale)).run();
});

test.beforeEach(() => {
	// A draft left by a failed run would block the next inventory of its kind.
	e2eDb().delete(inventories).where(eq(inventories.status, 'draft')).run();
});

test('C8 DoD: the balance is the sum of the moves and opens into them', async ({ page }) => {
	await login(page, 'manager');
	const code = await newItem(page, 10);
	await expect(balance(page)).toHaveText('0');

	await purchase(page, 12);
	await expect(balance(page)).toHaveText('12');

	await writeOff(page, 5);
	await expect(balance(page)).toHaveText('7');
	await expect(page.getByText('Ниже порога 10')).toBeVisible();
	await expect(page.getByTestId('move-qty')).toHaveText(['-5', '+12']);

	// A mistake is reversed, not deleted: the journal keeps all three rows.
	await page.getByRole('button', { name: 'Сторнировать' }).first().click();
	await page.getByTestId('modal').getByRole('button', { name: 'Сторнировать' }).click();
	await expect(page.getByText('Движение сторнировано').first()).toBeVisible();
	await expect(balance(page)).toHaveText('12');
	await expect(page.getByTestId('move-qty')).toHaveText(['+5', '-5', '+12']);
	await expect(page.getByText('Ниже порога 10')).toHaveCount(0);
	// The warehouse draws no money even for a role that may see it.
	expect(purchaseMoneyKeys(await page.content())).toEqual([]);

	await page.goto(`/crm/stock?search=${code}`);
	await expect(page.getByTestId('stock-balance')).toHaveText('12');
	const sheet = await page.request.get(`/crm/stock/export.xlsx?search=${code}`);
	expect(sheet.status()).toBe(200);
	expect(sheet.headers()['content-type']).toContain('spreadsheetml');
	const journal = await page.request.get(`/crm/stock/${await idOf(page)}/export.xlsx`);
	expect(journal.status()).toBe(200);
});

async function idOf(page: Page): Promise<string> {
	const href = await page.getByRole('link', { name: 'Открыть' }).first().getAttribute('href');
	return href?.split('/').at(-1) ?? '';
}

test('C8 DoD: an inventory is saved as a draft and applied in one operation', async ({ page }) => {
	await login(page, 'manager');
	const code = await newItem(page, 0);
	const id = itemId(page);
	await purchase(page, 12);

	await page.goto('/crm/stock/inventories');
	await expect(async () => {
		await page.getByRole('button', { name: 'Новая инвентаризация' }).click();
		await expect(page.getByTestId('modal')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByRole('button', { name: 'Открыть черновик' }).click();
	await expect(page).toHaveURL(/\/crm\/stock\/inventories\/\d+$/);
	await expect(page.getByTestId('inventory-status')).toHaveText('Черновик');

	const line = page.getByRole('row').filter({ hasText: code });
	await expect(line).toContainText('12');
	await line.getByRole('spinbutton').fill('9');
	await page.getByRole('button', { name: 'Сохранить черновик' }).click();
	await expect(page.getByText('Черновик сохранён').first()).toBeVisible();
	await expect(line).toContainText('-3');

	// The draft wrote nothing to the journal.
	await page.goto(`/crm/stock/${id}`);
	await expect(balance(page)).toHaveText('12');

	await page.goBack();
	await expect(page.getByRole('row').filter({ hasText: code }).getByRole('spinbutton')).toHaveValue(
		'9'
	);
	await page.getByRole('button', { name: 'Провести' }).click();
	await expect(page.getByTestId('inventory-status')).toHaveText('Проведена');
	await expect(page.getByRole('spinbutton')).toHaveCount(0);

	await page.goto(`/crm/stock/${id}`);
	await expect(balance(page)).toHaveText('9');
	await expect(page.getByTestId('move-qty')).toHaveText(['-3', '+12']);
	await expect(page.getByText('Инвентаризация №')).toBeVisible();
});

test('C8: the server refuses a zero move, a purchase with a minus and a write without stock.manage', async ({
	page
}) => {
	await login(page, 'manager');
	await newItem(page, 0);
	const id = itemId(page);
	await purchase(page, 4);

	// An action posted as JSON answers HTTP 200 and carries the failure status in the body.
	const post = (action: string, form: Record<string, string>) =>
		page.request.post(`/crm/stock/${id}?/${action}`, {
			headers: { origin: ORIGIN, accept: 'application/json' },
			form
		});
	const zero = await post('move', { type: 'adjustment', qty: '0', reasonId: '', comment: '' });
	expect(await zero.json()).toMatchObject({ type: 'failure', status: 422 });
	const minus = await post('move', { type: 'purchase', qty: '-2' });
	expect(await minus.json()).toMatchObject({ type: 'failure', status: 422 });
	await page.reload();
	await expect(balance(page)).toHaveText('4');

	await page.context().clearCookies();
	await login(page, 'carpenter');
	await page.goto(`/crm/stock/${id}`);
	await expect(page.getByRole('button', { name: 'Движение', exact: true })).toHaveCount(0);
	const forged = await post('move', { type: 'purchase', qty: '5' });
	expect(await forged.json()).toMatchObject({ type: 'failure', status: 403 });
	await page.reload();
	await expect(balance(page)).toHaveText('4');
});

test('C8: the driver and the portal get 403 on the warehouse', async ({ page }) => {
	await login(page, 'driver');
	expect((await page.goto('/crm/stock'))?.status()).toBe(403);
	expect((await page.goto('/crm/stock/inventories'))?.status()).toBe(403);
	expect((await page.request.get('/crm/stock/export.xlsx')).status()).toBe(403);
	const forged = await page.request.post('/crm/stock?/create', {
		headers: { origin: ORIGIN },
		form: { kind: 'component', code: 'X', title: 'X', unitId: '1', minThreshold: '0' }
	});
	expect(forged.status()).toBe(403);
	await page.goto('/crm');
	await expect(crmNavLink(page, 'Склад')).toHaveCount(0);
	await page.context().clearCookies();

	await login(page, 'cp_admin');
	expect((await page.goto('/crm/stock'))?.status()).toBe(403);
});
