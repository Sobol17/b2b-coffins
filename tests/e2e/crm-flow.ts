import { expect, type Page } from '@playwright/test';

/** The creation form of the workshop, filled the way a manager takes an order by phone. */
export async function enterRequest(
	page: Page,
	deceased: string,
	colour = 'Чёрный',
	qty = 1
): Promise<string> {
	await page.goto('/crm/requests/new');
	const counterparty = page.getByRole('option', { name: 'Ритуал-Сервис' });
	// A click before hydration lands on the server markup: repeat until the list opens.
	await expect(async () => {
		await page.getByRole('button', { name: 'Контрагент', exact: true }).click();
		await expect(counterparty).toBeVisible({ timeout: 1000 });
	}).toPass();
	await counterparty.click();
	await expect(page).toHaveURL(/counterpartyId=\d+/);
	await page.getByTestId('delivery-date').getByRole('button').click();
	await expect(page.getByRole('grid')).toBeVisible();
	await page.locator('[data-bits-day]:not([data-disabled])').last().click();
	await page.getByLabel('Время доставки').fill('10:00');
	await page.getByLabel('ФИО умершего').fill(deceased);

	await page.getByRole('button', { name: 'Позиция', exact: true }).click();
	await page.getByPlaceholder('Введите название').fill('Волга');
	await page.getByRole('option').first().click();
	// A colourless line would draw on the colourless opening stock of the seed (tech.md v1.41).
	await page.getByTestId('request-lines').locator('[data-slot="select-trigger"]').first().click();
	await page.getByRole('option', { name: colour, exact: true }).click();
	await page.getByTestId('request-lines').getByLabel('Штук').fill(String(qty));
	await page.getByRole('button', { name: 'Завести заявку' }).click();

	await expect(page).toHaveURL(/\/crm\/requests\/\d+$/);
	const number = (await page.getByTestId('request-number').innerText()).trim();
	expect(number).toMatch(/^З-\d{4}-\d{5}$/);
	return number;
}
