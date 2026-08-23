import { expect, test } from '@playwright/test';
import { login } from './fixtures';

test('the target role sees its contour built from the kit', async ({ page }) => {
	await login(page, 'cp_admin');

	const logout = page.getByRole('button', { name: 'Выйти' });
	await expect(logout).toBeVisible();
	await expect(logout).toHaveAttribute('data-slot', 'button');
	await expect(page.getByTestId('actor-roles')).toHaveText('cp_admin');
});

test('a foreign role still gets 403 after the markup moved onto the kit', async ({ page }) => {
	await login(page, 'cp_admin');

	const response = await page.goto('/crm');

	expect(response?.status()).toBe(403);
});

test('the login form is built from the kit and still reports a bad password', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Войти' })).toHaveAttribute('data-slot', 'button');

	await page.fill('input[name="email"]', 'admin@ritual-service.example');
	await page.fill('input[name="password"]', 'definitely-not-the-password');
	await page.click('button[type="submit"]');

	await expect(page.getByTestId('form-error')).toBeVisible();
});
