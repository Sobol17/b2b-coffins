import { expect, test } from '@playwright/test';
import { login } from './fixtures';

for (const width of [1280, 390]) {
	test(`counterparty row opens from any cell and remains a native link at ${width}px`, async ({
		page,
		context
	}) => {
		await page.setViewportSize({ width, height: 844 });
		await login(page, 'manager');
		await page.goto('/crm/counterparties?search=Ритуал-Сервис');
		const row = page.getByTestId('data-table-row').filter({ hasText: 'Ритуал-Сервис' });
		const link = row.getByRole('link', { name: /Ритуал-Сервис/ });
		await expect(link).toHaveAttribute('href', /\/crm\/counterparties\/\d+$/);
		const href = await link.getAttribute('href');
		if (!href) throw new Error('The row link has no destination');
		const targetUrl = new URL(href, page.url()).href;
		const debtCell = row.locator('td').last();
		async function clickDebtCell(button: 'left' | 'middle'): Promise<void> {
			await debtCell.scrollIntoViewIfNeeded();
			const box = await debtCell.boundingBox();
			expect(box).not.toBeNull();
			if (!box) throw new Error('The debt cell has no bounds');
			// The row link intentionally covers the cell; click its real screen coordinates.
			await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
		}
		// A modifier click anywhere in the row must retain the browser's native new-tab behavior.
		const [opened] = await Promise.all([context.waitForEvent('page'), clickDebtCell('middle')]);
		await opened.waitForURL(targetUrl);
		await opened.close();
		await expect(page).toHaveURL(/\/crm\/counterparties\?search=/);
		await clickDebtCell('left');
		await expect(page).toHaveURL(targetUrl);
		await expect(page.getByTestId('counterparty-name')).toHaveText('Ритуал-Сервис');
		await page.goBack();
		await link.focus();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(targetUrl);
	});
}
