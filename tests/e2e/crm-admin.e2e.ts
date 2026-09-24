import { expect, test, type Page } from '@playwright/test';
import { login, logout } from './fixtures';

/**
 * The newest journal entry of one action. Filters live in the url (FilterBar), so the spec opens
 * the filtered view directly and checks that the select names the action in words.
 */
async function journalEntry(page: Page, action: string, title: string) {
	await page.goto(`/crm/settings/audit?action=${action}`);
	await expect(page.getByRole('button', { name: 'Действие' })).toHaveText(title);
	const row = page.getByTestId('data-table-row').first();
	await expect(row.getByTestId('audit-action')).toHaveText(title);
	return row;
}

test.describe('the owner runs the workshop without a developer (C1)', () => {
	test('creates a workshop account that signs in with the temporary password', async ({ page }) => {
		// global-setup disables e2e.* accounts, so earlier runs leave nothing active behind.
		const email = `e2e.crm.${Date.now()}@workshop.example`;
		await login(page, 'owner');
		await page.getByRole('link', { name: 'Пользователи' }).click();
		await expect(page).toHaveURL('/crm/settings/users');

		await page.getByRole('button', { name: 'Добавить пользователя' }).click();
		const modal = page.getByTestId('modal');
		await modal.locator('input[name="fullName"]').fill('Павел Орлов');
		await modal.locator('input[name="email"]').fill(email);
		await modal.getByLabel('Столяр').click();
		await modal.getByLabel('Маляр').click();
		await modal.getByRole('button', { name: 'Создать пользователя' }).click();

		const password = (await page.getByTestId('temporary-password').textContent())?.trim() ?? '';
		expect(password.length).toBeGreaterThanOrEqual(12);
		await page.getByRole('textbox', { name: 'Поиск' }).fill(email);
		const row = page.getByTestId('data-table-row').filter({ hasText: email });
		await expect(row.getByTestId('user-roles')).toHaveText('Столяр, Маляр');
		await expect(row.getByTestId('user-status')).toHaveText('Приглашён');

		const entry = await journalEntry(page, 'crm_user.create', 'Пользователь создан');
		await expect(entry).toContainText('Игорь Соболев');
		await expect(entry.getByTestId('audit-changes')).toContainText('carpenter');

		await logout(page);
		await page.goto('/login');
		await page.fill('input[name="email"]', email);
		await page.fill('input[name="password"]', password);
		await page.click('button[type="submit"]');
		await expect(page).toHaveURL('/password/change');
	});

	test('adds a dictionary item and finds it in the journal', async ({ page }) => {
		const code = `e2e${Date.now()}`;
		await login(page, 'owner');
		await page.goto('/crm/settings/dicts?dict=transport');
		await expect(page.getByTestId('dict-title')).toHaveText('Транспорт');

		await page.getByRole('button', { name: 'Добавить запись' }).click();
		const modal = page.getByTestId('modal');
		await modal.locator('input[name="code"]').fill(code);
		await modal.locator('input[name="title"]').fill('Газель с тентом');
		await modal.getByRole('button', { name: 'Добавить' }).click();

		const row = page.getByTestId('data-table-row').filter({ hasText: code });
		await expect(row).toContainText('Газель с тентом');
		await expect(row.getByTestId('dict-status')).toHaveText('Используется');

		const entry = await journalEntry(page, 'dict.create', 'Запись справочника создана');
		await expect(entry.getByTestId('audit-changes')).toContainText(code);
	});

	test('changes a setting and sees the old and the new value in the journal', async ({ page }) => {
		await login(page, 'owner');
		await page.getByRole('link', { name: 'Настройки' }).click();
		const form = page.getByTestId('staff-limit-form');
		const field = form.locator('input[name="staffLimitDefault"]');
		const before = await field.inputValue();
		// A run that failed midway leaves its value behind: pick one that differs from what is there.
		const next = before === '17' ? '18' : '17';

		await field.fill(next);
		await form.getByRole('button', { name: 'Сохранить лимит' }).click();
		await expect(page.getByText('Лимит сохранён')).toBeVisible();
		await page.reload();
		await expect(page.getByTestId('staff-limit-form').locator('input')).toHaveValue(next);

		const entry = await journalEntry(page, 'settings.update', 'Настройки изменены');
		await expect(entry.getByTestId('audit-changes')).toContainText(
			new RegExp(`counterparty\\.staff_limit_default:\\s*${before}\\s*→\\s*${next}`)
		);

		// Settings are operator-owned and the seed never overwrites them: put the value back.
		await page.goto('/crm/settings');
		await page.getByTestId('staff-limit-form').locator('input').fill(before);
		await page.getByTestId('staff-limit-form').getByRole('button').click();
		await expect(page.getByText('Лимит сохранён')).toBeVisible();
	});

	test('shows the next request number in the chosen format', async ({ page }) => {
		await login(page, 'owner');
		await page.goto('/crm/settings');
		await expect(page.getByTestId('numbering-preview')).toHaveText(/^З-\d{4}-\d{5}$/);
	});
});

test.describe('owner sections stay closed to everyone else', () => {
	const SECTIONS = [
		'/crm/settings',
		'/crm/settings/users',
		'/crm/settings/dicts',
		'/crm/settings/audit'
	];

	test('a manager sees no owner links and gets 403 on a direct link', async ({ page }) => {
		await login(page, 'manager');
		await expect(page.getByRole('link', { name: 'Пользователи' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Журнал' })).toHaveCount(0);
		for (const path of SECTIONS) {
			expect((await page.goto(path))?.status(), path).toBe(403);
		}
	});

	test('a counterparty administrator gets 403 on the CRM settings', async ({ page }) => {
		await login(page, 'cp_admin');
		for (const path of SECTIONS) {
			expect((await page.goto(path))?.status(), path).toBe(403);
		}
	});

	test('a manager cannot create an account by posting the form directly', async ({ page }) => {
		await login(page, 'manager');
		const response = await page.request.post('/crm/settings/users?/create', {
			headers: { origin: 'http://localhost:4173' },
			form: { fullName: 'Взлом', email: 'e2e.forged@workshop.example', roles: 'owner' }
		});
		expect(response.status()).toBe(403);
	});
});
