import { expect, type Page } from '@playwright/test';
import { login } from './fixtures';

/** The portal side of P4: a sent request is what every later slice starts from. */
export async function sendRequest(page: Page, role: 'cp_admin' | 'cp_employee'): Promise<string> {
	await login(page, role);
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').filter({ hasText: 'Модель «Волга»' }).click();
	await page.getByLabel('Количество').fill('1');
	await page.getByTestId('add-to-draft').click();

	await page.goto('/portal/cart');
	await page.getByText('Самовывоз со склада мастерской').click();
	await page.getByTestId('submit-draft').click();

	const banner = page.getByTestId('request-submitted');
	await expect(banner).toContainText(/З-\d{4}-\d{5}/);
	const number = (await banner.innerText()).match(/З-\d{4}-\d{5}/)?.[0];
	if (!number) throw new Error('the portal did not show a request number');
	return number;
}

export async function openCard(page: Page, number: string): Promise<void> {
	await page.goto('/portal/requests');
	await page.getByTestId('request-row').filter({ hasText: number }).getByText('Открыть').click();
	await expect(page.getByTestId('request-number')).toContainText(number);
}
