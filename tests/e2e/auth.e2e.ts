import { expect, test } from '@playwright/test';
import { ACCOUNTS, HOME_BY_SCOPE, login, type RoleKey } from './fixtures';

const ROLES = Object.keys(ACCOUNTS) as RoleKey[];

// The CRM header names the role in words (C1); the portal header keeps its own layout.
const SHOWN_ROLE: Readonly<Record<RoleKey, string>> = {
	owner: 'Руководитель',
	manager: 'Администратор',
	carpenter: 'Столяр',
	painter: 'Маляр',
	driver: 'Водитель',
	cp_admin: 'cp_admin',
	cp_employee: 'cp_employee'
};

test.describe('login and contour isolation across all seven roles', () => {
	for (const role of ROLES) {
		const account = ACCOUNTS[role];
		const home = HOME_BY_SCOPE[account.scope];
		const foreign = account.scope === 'crm' ? '/portal' : '/crm';

		test(`${role} signs in and lands in its own contour`, async ({ page }) => {
			await login(page, role);

			await expect(page).toHaveURL(home);
			await expect(page.getByTestId('actor-roles')).toHaveText(SHOWN_ROLE[role]);
		});

		test(`${role} gets 403 on a direct link into the other contour`, async ({ page }) => {
			await login(page, role);

			const response = await page.goto(foreign);

			expect(response?.status()).toBe(403);
		});
	}
});

test('an anonymous visitor is sent to the login form, not to a contour', async ({ page }) => {
	await page.goto('/portal');
	await expect(page).toHaveURL(/\/login\?redirectTo=/);

	await page.goto('/crm');
	await expect(page).toHaveURL(/\/login\?redirectTo=/);
});

test('a wrong password answers the same way as an unknown address', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[name="email"]', ACCOUNTS.manager.email);
	await page.fill('input[name="password"]', 'definitely-not-the-password');
	await page.click('button[type="submit"]');
	const wrongPassword = await page.getByTestId('form-error').textContent();

	await page.goto('/login');
	await page.fill('input[name="email"]', 'nobody@nowhere.example');
	await page.fill('input[name="password"]', 'definitely-not-the-password');
	await page.click('button[type="submit"]');
	const unknownAddress = await page.getByTestId('form-error').textContent();

	expect(wrongPassword).toBe(unknownAddress);
});

test('logout drops the session and the protected page stops answering', async ({ page }) => {
	await login(page, 'manager');

	await page.click('button:has-text("Выйти")');
	await expect(page).toHaveURL('/login');

	await page.goto('/crm');
	await expect(page).toHaveURL(/\/login\?redirectTo=/);
});

test('the root path routes each contour to its own home', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto('/');
	await expect(page).toHaveURL('/portal');
});
