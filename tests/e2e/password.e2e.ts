import { expect, test } from '@playwright/test';
import { TEMP_ACCOUNTS } from './fixtures';

const NEW_PASSWORD = 'Ochen!Nadezhnyi9';

async function submitLogin(
	page: import('@playwright/test').Page,
	email: string,
	password: string
): Promise<void> {
	await page.goto('/login');
	await page.fill('input[name="email"]', email);
	await page.fill('input[name="password"]', password);
	await page.click('button[type="submit"]');
}

test('a temporary password forces the change form before anything else', async ({ page }) => {
	const account = TEMP_ACCOUNTS.mustChange;

	await submitLogin(page, account.email, account.password);
	await expect(page).toHaveURL('/password/change');
	await expect(page.getByTestId('must-change')).toBeVisible();

	// The contour stays out of reach while the account still owes a password.
	await page.goto('/crm');
	await expect(page).toHaveURL('/password/change');
});

test('changing the password ends every session and the new one works', async ({ page }) => {
	const account = TEMP_ACCOUNTS.mustChange;

	await submitLogin(page, account.email, account.password);
	await page.fill('input[name="currentPassword"]', account.password);
	await page.fill('input[name="newPassword"]', NEW_PASSWORD);
	await page.fill('input[name="repeatPassword"]', NEW_PASSWORD);
	await page.click('button[type="submit"]');

	await expect(page).toHaveURL(/\/login\?changed=1/);

	await page.goto('/crm');
	await expect(page).toHaveURL(/\/login\?redirectTo=/);

	await submitLogin(page, account.email, NEW_PASSWORD);
	await expect(page).toHaveURL('/crm');
});

// Its own account: the test above already spent the password of TEMP_ACCOUNTS.mustChange.
test('a weak new password is rejected by the server', async ({ page }) => {
	const account = TEMP_ACCOUNTS.weakChange;

	await submitLogin(page, account.email, account.password);
	await page.fill('input[name="currentPassword"]', account.password);
	await page.fill('input[name="newPassword"]', 'short1');
	await page.fill('input[name="repeatPassword"]', 'short1');
	await page.click('button[type="submit"]');

	await expect(page).toHaveURL('/password/change');
	await expect(page.locator('text=Пароль короче 12 символов')).toBeVisible();
});

test('five wrong passwords lock the account, and the right one no longer helps', async ({
	page
}) => {
	const account = TEMP_ACCOUNTS.lockout;

	for (let attempt = 0; attempt < 5; attempt += 1) {
		await submitLogin(page, account.email, 'wrong-password-here');
		await expect(page.getByTestId('form-error')).toBeVisible();
	}

	await submitLogin(page, account.email, account.password);

	await expect(page.getByTestId('form-error')).toHaveText(/заблокирована/);
});

test('a reset request answers the same way for a known and an unknown address', async ({
	page
}) => {
	await page.goto('/password/reset');
	await page.fill('input[name="email"]', TEMP_ACCOUNTS.lockout.email);
	await page.click('button[type="submit"]');
	await expect(page.getByTestId('reset-sent')).toBeVisible();

	await page.goto('/password/reset');
	await page.fill('input[name="email"]', 'no.such.person@nowhere.example');
	await page.click('button[type="submit"]');
	await expect(page.getByTestId('reset-sent')).toBeVisible();
});
