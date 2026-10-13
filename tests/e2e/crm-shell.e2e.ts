import { expect, test } from '@playwright/test';
import { crmNavLink, login, openCrmMenu } from './fixtures';

test('shell: the owner sees grouped sections and the current one is marked', async ({ page }) => {
	await login(page, 'owner');
	const nav = page.getByRole('navigation', { name: 'Разделы' });
	for (const group of ['Работа', 'Учёт', 'Продажи', 'Администрирование']) {
		await expect(nav.getByText(group, { exact: true })).toBeVisible();
	}
	await expect(crmNavLink(page, 'Главная')).toHaveAttribute('aria-current', 'page');

	await crmNavLink(page, 'Склад').click();
	await expect(page).toHaveURL(/\/crm\/stock$/);
	await expect(crmNavLink(page, 'Склад')).toHaveAttribute('aria-current', 'page');
	await expect(crmNavLink(page, 'Главная')).not.toHaveAttribute('aria-current', 'page');

	// A nested page keeps its section lit, and the deeper link wins over its prefix.
	await page.goto('/crm/settings/users');
	await expect(crmNavLink(page, 'Пользователи')).toHaveAttribute('aria-current', 'page');
	await expect(crmNavLink(page, 'Настройки')).not.toHaveAttribute('aria-current', 'page');
	await expect(page.getByTestId('shell-place')).toContainText('Пользователи');
});

test('shell: the fold state survives a reload', async ({ page }) => {
	await login(page, 'owner');
	await expect(crmNavLink(page, 'Заявки')).toBeVisible();
	await expect(async () => {
		await page.getByRole('button', { name: 'Меню разделов' }).click();
		await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed', {
			timeout: 1000
		});
	}).toPass();

	await page.reload();
	await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed');
});

test('shell: the home screen offers a tile for every section of the role', async ({ page }) => {
	await login(page, 'owner');
	const links = await page
		.getByRole('navigation', { name: 'Разделы' })
		.getByRole('link')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
	const tiles = await page
		.getByTestId('home-tile')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
	// Every section but the home screen itself.
	expect(tiles).toEqual(links.filter((href) => href !== '/crm'));
	// A screen reader jumps to the one main landmark of the page.
	await expect(page.getByRole('main')).toHaveCount(1);
});

test('shell: a driver sees only the sections of the role and gets 403 on the rest', async ({
	page
}) => {
	await login(page, 'driver');
	await expect(crmNavLink(page, 'Доставка')).toBeVisible();
	for (const name of ['Заявки', 'Каталог', 'Пользователи', 'Журнал']) {
		await expect(crmNavLink(page, name)).toHaveCount(0);
	}
	await expect(page.getByTestId('home-tile').filter({ hasText: 'Пользователи' })).toHaveCount(0);
	expect((await page.goto('/crm/settings/users'))?.status()).toBe(403);
});

test('shell: on a phone the sections open as a sheet and close after a tap', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await login(page, 'driver');
	await expect(crmNavLink(page, 'Доставка')).toHaveCount(0);

	await openCrmMenu(page);
	await crmNavLink(page, 'Доставка').click();
	await expect(page).toHaveURL(/\/crm\/delivery$/);
	await expect(crmNavLink(page, 'Доставка')).toHaveCount(0);
});
