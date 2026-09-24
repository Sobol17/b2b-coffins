import { expect, test } from '@playwright/test';
import { enterRequest } from './crm-flow';
import { login, purchaseMoneyKeys } from './fixtures';
import { e2eDb, stockUp } from './transitions';

test('C4 DoD: a manager takes a request from entry to ready in the CRM, changes after the launch land in history', async ({
	page
}) => {
	const deceased = `Петров Пётр ${Date.now()}`;
	await login(page, 'manager');
	const number = await enterRequest(page, deceased);

	// The shop works by position (v1.41): a priced request goes into work with nobody on it.
	await page.getByRole('button', { name: 'Принять в работу' }).click();
	await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'В работе' })).toBeVisible();

	// After the launch the reason is required and goes into history with the change.
	await page.getByRole('button', { name: 'Изменить' }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Штук').fill('3');
	await dialog.getByLabel('Причина изменения').fill('Клиент попросил ещё два');
	await dialog.getByRole('button', { name: 'Сохранить' }).click();
	await expect(page.getByTestId('request-history')).toContainText('Клиент попросил ещё два');
	await expect(page.getByTestId('request-history')).toContainText('→ 3');

	// The guard answers in words: the stock does not fill the request yet.
	await page.getByRole('button', { name: 'Заявка собрана' }).click();
	await expect(page.getByText('На складе не хватает позиций заявки')).toBeVisible();

	stockUp(e2eDb(), number);
	await page.getByRole('button', { name: 'Заявка собрана' }).click();
	await expect(
		page.locator('[data-slot="badge"]').filter({ hasText: 'Готов к выдаче' })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Добавить позицию' })).toHaveCount(0);

	await page.goto(`/crm/requests?search=${encodeURIComponent(deceased)}`);
	await expect(page.getByTestId('data-table-row')).toHaveCount(1);
	await expect(page.getByTestId('data-table-row')).toContainText('Готов к выдаче');
});

test('C4: the board shows the request in its column and a dropped card asks the state machine', async ({
	page
}) => {
	await login(page, 'manager');
	const number = await enterRequest(page, `Сидоров Сидор ${Date.now()}`);
	await page.goto(`/crm/board?search=${encodeURIComponent(number)}`);
	const board = page.getByTestId('request-board');
	const card = board.locator('[data-slot="kanban-card"]').filter({ hasText: number });
	await expect(card).toHaveAttribute('data-status', 'new');

	// The arrow key moves the card to «В работе»; the next step waits for the stock to fill it.
	await card.getByRole('link').focus();
	await page.keyboard.press('ArrowRight');
	await expect(card).toHaveAttribute('data-status', 'in_work');
	await card.getByRole('link').focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText('На складе не хватает позиций заявки')).toBeVisible();
	await expect(card).toHaveAttribute('data-status', 'in_work');

	await card.getByRole('link').click();
	await expect(page.getByTestId('request-number')).toHaveText(number);
});

test('C4: the registry exports the filtered rows as XLSX', async ({ page }) => {
	await login(page, 'manager');
	await page.goto('/crm/requests?status=new');
	const link = page.getByTestId('data-table-export');
	// The sheet repeats the view: the link carries the filters of the page.
	await expect(link).toHaveAttribute('href', '/crm/requests/export.xlsx?status=new');
	const download = page.waitForEvent('download');
	await link.click();
	const stream = await (await download).createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	// An XLSX file is a zip archive: it starts with the PK signature.
	expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe('PK');
});

test('C4: the crew and the portal get 403 on the workshop screens', async ({ page }) => {
	await login(page, 'carpenter');
	for (const path of ['/crm/board', '/crm/requests', '/crm/requests/new', '/crm/requests/1']) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(403);
	}
	const sheet = await page.request.get('/crm/requests/export.xlsx');
	expect(sheet.status()).toBe(403);
	await page.context().clearCookies();

	await login(page, 'cp_employee');
	const answer = await page.goto('/crm/requests');
	expect(answer?.status()).toBe(403);
	expect(purchaseMoneyKeys(await page.content())).toEqual([]);
});
