import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, crmNavLink, login, logout } from './fixtures';

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
		await crmNavLink(page, 'Пользователи').click();
		await expect(page).toHaveURL('/crm/settings/users');

		await page.getByRole('button', { name: 'Добавить пользователя' }).click();
		const modal = page.getByTestId('modal');
		// The dialog's initial autofocus must settle before a later field receives typing.
		await expect(modal.locator('input[name="fullName"]')).toBeFocused();
		await modal.locator('input[name="fullName"]').fill('Павел Орлов');
		await modal.locator('input[name="email"]').fill(email);
		await expect(modal.locator('input[name="email"]')).toHaveValue(email);
		await modal.getByRole('button', { name: 'Роли' }).click();
		await page.getByLabel('Столяр', { exact: true }).click();
		await page.getByLabel('Маляр', { exact: true }).click();
		await page.keyboard.press('Escape');
		await expect(modal.getByRole('button', { name: 'Роли' })).toContainText('Столяр, Маляр');
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

	test('edits contacts and roles, keeps a refused edit open, then confirms deletion', async ({
		page
	}) => {
		const email = `e2e.edit.${Date.now()}@workshop.example`;
		const nextEmail = email.replace('e2e.edit.', 'e2e.updated.');
		await page.setViewportSize({ width: 390, height: 844 });
		await login(page, 'owner');
		await page.goto('/crm/settings/users');
		await page.getByRole('button', { name: 'Добавить пользователя' }).click();
		const modal = page.getByTestId('modal');
		await modal.getByLabel('Имя и фамилия').fill('Павел Орлов');
		await modal.getByLabel('Электронная почта').fill(email);
		await modal.getByRole('button', { name: 'Роли' }).click();
		await page.getByLabel('Столяр', { exact: true }).click();
		await page.keyboard.press('Escape');
		await modal.getByRole('button', { name: 'Создать пользователя' }).click();
		await expect(modal).toBeHidden();
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.getByRole('textbox', { name: 'Поиск' }).fill(email);
		const row = page.getByTestId('data-table-row').filter({ hasText: email });
		await row.getByRole('button', { name: 'Изменить', exact: true }).click();
		await expect(modal).toBeInViewport({ ratio: 1 });
		await expect(modal.getByLabel('Имя и фамилия')).toHaveValue('Павел Орлов');
		await modal.getByLabel('Имя и фамилия').fill('Алексей Петров');
		await modal.getByLabel('Телефон').fill('+7 (900) 111-22-33');
		await modal.getByLabel('Электронная почта').fill(ACCOUNTS.cp_admin.email);
		await modal.getByLabel('Столяр', { exact: true }).click();
		await modal.getByLabel('Водитель', { exact: true }).click();
		await modal.getByRole('button', { name: 'Сохранить изменения' }).click();
		await expect(modal.getByTestId('edit-user-error')).toContainText('Этот адрес уже используется');
		await expect(modal).toBeInViewport({ ratio: 1 });
		await expect(modal.getByLabel('Имя и фамилия')).toHaveValue('Алексей Петров');
		await expect(row).toContainText('Павел Орлов');
		await expect(row.getByTestId('user-roles')).toHaveText('Столяр');
		await modal.getByLabel('Электронная почта').fill(nextEmail.toUpperCase());
		await modal.getByRole('button', { name: 'Сохранить изменения' }).click();
		await expect(modal).toBeHidden();
		await page.getByRole('textbox', { name: 'Поиск' }).fill(nextEmail);
		const editedRow = page.getByTestId('data-table-row').filter({ hasText: nextEmail });
		await expect(editedRow).toContainText('Алексей Петров');
		await expect(editedRow).toContainText('+7 (900) 111-22-33');
		await expect(editedRow.getByTestId('user-roles')).toHaveText('Водитель');

		await editedRow.getByRole('button', { name: 'Сгенерировать пароль' }).click();
		await expect(page.getByTestId('created-access')).toContainText(`Логин: ${nextEmail}`);
		await expect(page.getByTestId('created-access')).toContainText('Письмо не отправляется');
		await expect(page.getByTestId('temporary-password')).not.toBeEmpty();

		await editedRow.getByRole('button', { name: 'Удалить', exact: true }).click();
		await expect(modal).toContainText('Работы, выплаты и журнал сохранятся');
		await modal.getByRole('button', { name: 'Отмена' }).click();
		await expect(editedRow).toContainText('Алексей Петров');
		await editedRow.getByRole('button', { name: 'Удалить', exact: true }).click();
		await modal.getByRole('button', { name: 'Удалить пользователя', exact: true }).click();
		await expect(modal).toBeHidden();
		await expect(editedRow).toHaveCount(0);
		await page.getByRole('button', { name: 'Добавить пользователя' }).click();
		await expect(modal.getByLabel('Имя и фамилия')).toBeFocused();
		await modal.getByLabel('Имя и фамилия').fill('Новый сотрудник');
		await modal.getByLabel('Электронная почта').fill(nextEmail);
		await modal.getByRole('button', { name: 'Роли' }).click();
		await page.getByLabel('Водитель', { exact: true }).click();
		await page.keyboard.press('Escape');
		await modal.getByRole('button', { name: 'Создать пользователя' }).click();
		await expect(modal).toBeHidden();
		await expect(editedRow).toContainText('Новый сотрудник');
		await journalEntry(page, 'crm_user.delete', 'Пользователь удалён');
		const edited = await journalEntry(page, 'crm_user.update', 'Пользователь изменён');
		await expect(edited.getByTestId('audit-changes')).toContainText('driver');
		await expect(edited.getByTestId('audit-changes')).not.toContainText(nextEmail);
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
		await crmNavLink(page, 'Настройки').click();
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
		await expect(crmNavLink(page, 'Пользователи')).toHaveCount(0);
		await expect(crmNavLink(page, 'Журнал')).toHaveCount(0);
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

	test('a manager cannot manage accounts by posting forms directly', async ({ page }) => {
		await login(page, 'manager');
		for (const action of ['create', 'update', 'delete']) {
			const response = await page.request.post(`/crm/settings/users?/${action}`, {
				headers: { origin: 'http://localhost:4173' },
				form: { id: '1', fullName: 'Взлом', email: 'e2e.forged@workshop.example', roles: 'owner' }
			});
			expect(response.status(), action).toBe(403);
		}
	});
});
