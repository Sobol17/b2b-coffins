import { expect, test } from '@playwright/test';
import { ACCOUNTS, login } from './fixtures';

const ORIGIN = 'http://localhost:4173';

test('a portal employee edits the own contact and it survives a reload', async ({ page }) => {
	await login(page, 'cp_employee');
	await page.goto('/portal/profile');

	await page.fill('input[name="fullName"]', 'Ольга Гущина-Тест');
	await page.fill('input[name="phone"]', '+7 916 333-33-33');
	await page.click('button:has-text("Сохранить")');
	await expect(page.getByTestId('profile-saved')).toBeVisible();

	await page.reload();
	await expect(page.locator('input[name="fullName"]')).toHaveValue('Ольга Гущина-Тест');
	await expect(page.locator('input[name="phone"]')).toHaveValue('+7 916 333-33-33');

	// Put the seed values back: other specs read this account.
	await page.fill('input[name="fullName"]', 'Ольга Гущина');
	await page.fill('input[name="phone"]', '+7 916 222-22-22');
	await page.click('button:has-text("Сохранить")');
	await expect(page.getByTestId('profile-saved')).toBeVisible();
});

test('the server rejects a malformed phone and keeps the old value', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto('/portal/profile');
	const before = await page.locator('input[name="phone"]').inputValue();

	await page.fill('input[name="phone"]', 'позвоните мне');
	await page.click('button:has-text("Сохранить")');
	await expect(page.locator('text=Телефон: цифры, пробелы, скобки и дефис')).toBeVisible();

	await page.reload();
	await expect(page.locator('input[name="phone"]')).toHaveValue(before);
});

test('the e-mail field is read-only and a forged e-mail is ignored', async ({ page }) => {
	await login(page, 'cp_admin');

	const response = await page.request.post('/portal/profile', {
		headers: { origin: ORIGIN },
		form: { fullName: 'Пётр Ильин', phone: '+7 916 111-11-11', email: 'forged@evil.example' }
	});
	expect(response.status()).toBe(200);

	await page.goto('/portal/profile');
	await expect(page.locator('input[readonly]')).toHaveValue(ACCOUNTS.cp_admin.email);
});

test('a CRM role gets 403 on the page and on the action', async ({ page }) => {
	await login(page, 'manager');

	expect((await page.goto('/portal/profile'))?.status()).toBe(403);

	const response = await page.request.post('/portal/profile', {
		headers: { origin: ORIGIN },
		form: { fullName: 'Менеджер', phone: '' }
	});
	expect(response.status()).toBe(403);
});

test('the profile shows neither the requisites nor the contract discount', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto('/portal/profile');

	await expect(page.getByRole('heading', { name: 'Реквизиты' })).toHaveCount(0);
	await expect(page.getByText('Скидка по договору')).toHaveCount(0);
	await expect(page.getByTestId('counterparty-money')).toContainText('Задолженность');
	await expect(page.getByTestId('counterparty-money')).toContainText('Закупка за год');
});
