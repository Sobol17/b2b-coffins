import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, login } from './fixtures';

const ORIGIN = 'http://localhost:4173';
const OWN_PASSWORD = 'Ochen!Nadezhnyi9';

async function signIn(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await page.fill('input[name="email"]', email);
	await page.fill('input[name="password"]', password);
	await page.click('button[type="submit"]');
}

test('an administrator gives access to an employee who replaces the temporary password', async ({
	page
}) => {
	// global-setup removes e2e.* accounts, so reruns never hit the staff limit.
	const email = `e2e.${Date.now()}@ritual-service.example`;
	await login(page, 'cp_admin');
	await page.goto('/portal/staff');

	await page.getByRole('button', { name: 'Добавить сотрудника' }).click();
	const modal = page.getByTestId('modal');
	await modal.locator('input[name="fullName"]').fill('Анна Белова');
	await modal.locator('input[name="email"]').fill(email);
	await modal.getByRole('button', { name: 'Создать доступ' }).click();

	const password = (await page.getByTestId('temporary-password').textContent())?.trim() ?? '';
	expect(password.length).toBeGreaterThanOrEqual(12);
	await expect(page.getByTestId('data-table-row').filter({ hasText: email })).toContainText(
		'Приглашён'
	);

	await page.click('button:has-text("Выйти")');
	await signIn(page, email, password);
	await expect(page).toHaveURL('/password/change');

	await page.fill('input[name="currentPassword"]', password);
	await page.fill('input[name="newPassword"]', OWN_PASSWORD);
	await page.fill('input[name="repeatPassword"]', OWN_PASSWORD);
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/login\?changed=1/);

	await signIn(page, email, OWN_PASSWORD);
	await expect(page).toHaveURL('/portal');
});

test('the administrator is not offered to disable the own account', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto('/portal/staff');

	const ownRow = page.getByTestId('data-table-row').filter({ hasText: ACCOUNTS.cp_admin.email });
	await expect(ownRow).toBeVisible();
	await expect(ownRow.getByRole('button', { name: 'Отключить' })).toHaveCount(0);
});

test('an employee gets 403 on the staff page and on its actions, and no menu entry', async ({
	page
}) => {
	await login(page, 'cp_employee');

	expect((await page.goto('/portal/staff'))?.status()).toBe(403);

	const response = await page.request.post('/portal/staff?/create', {
		headers: { origin: ORIGIN },
		form: { fullName: 'Чужой', email: 'intruder@evil.example', phone: '', role: 'cp_admin' }
	});
	expect(response.status()).toBe(403);

	await page.goto('/portal/profile');
	await expect(page.getByRole('link', { name: 'Мои сотрудники' })).toHaveCount(0);
});

test('the server response of the profile carries money for the administrator only', async ({
	page
}) => {
	await login(page, 'cp_admin');
	const adminBody = await (await page.request.get('/portal/profile/__data.json')).text();
	// Proves the probe can see money keys at all, so the employee check below is not vacuous.
	expect(adminBody).toContain('debtMinor');
	await page.click('button:has-text("Выйти")');

	await login(page, 'cp_employee');
	const response = await page.request.get('/portal/profile/__data.json');
	expect(response.status()).toBe(200);
	const employeeBody = await response.text();
	expect(employeeBody).not.toContain('Minor');
	expect(employeeBody).not.toContain('discountPercent');
});
