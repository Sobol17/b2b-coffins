import { expect, type Page } from '@playwright/test';

/**
 * One station's part in a request (tech.md §20.4): the worker finds the visit by number, takes it,
 * marks every piece and presses «Выполнено». A single piece is a tick, several are «Сделано всё».
 */
export async function passStation(page: Page, number: string): Promise<void> {
	await page.goto(`/crm/shop?q=${encodeURIComponent(number)}`);
	await page.getByTestId('shop-task').filter({ hasText: number }).click();
	await expect(page.getByTestId('shop-task-number')).toHaveText(number);
	// A visit the worker already took has no «Взять в работу» left.
	const take = page.getByRole('button', { name: 'Взять в работу' });
	if ((await take.count()) > 0) {
		await take.click();
		await expect(take).toHaveCount(0);
	}

	for (const box of await page.getByTestId('shop-job').getByRole('checkbox').all()) {
		await box.click();
		await expect(box).toBeChecked();
	}
	const all = page.getByRole('button', { name: 'Сделано всё' });
	while ((await all.count()) > 0) {
		const before = await all.count();
		await all.first().click();
		await expect(all).toHaveCount(before - 1);
	}

	const done = page.getByRole('button', { name: 'Выполнено' });
	await expect(done).toBeEnabled();
	await done.click();
	await expect(page.getByTestId('shop-task-closed')).toBeVisible();
}
