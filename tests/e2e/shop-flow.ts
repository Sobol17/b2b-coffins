import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { requests, requestItems, workTypes } from '../../src/lib/server/db/schema';
import { WORK_ROLES } from '../../src/lib/types/roles';
import { e2eDb } from './transitions';

/** Explicit per-position prices for this test request; production seed never guesses a mapping. */
export function configureShopRates(number: string): void {
	const db = e2eDb();
	const variants = db
		.select({ id: requestItems.variantId })
		.from(requestItems)
		.innerJoin(requests, eq(requests.id, requestItems.requestId))
		.where(eq(requests.number, number))
		.all();
	for (const variant of variants)
		for (const roleCode of WORK_ROLES) {
			const exists = db
				.select()
				.from(workTypes)
				.all()
				.find((row) => row.variantId === variant.id && row.roleCode === roleCode);
			if (!exists)
				db.insert(workTypes)
					.values({
						title: `E2E Позиция ${variant.id} ${roleCode}`,
						variantId: variant.id,
						roleCode,
						rateMinor: 35_000
					})
					.run();
		}
}

/**
 * One station's part in a request (tech.md §20.4): the worker finds the visit by number, takes it,
 * marks every piece and presses «Выполнено». A single piece is a tick, several are «Сделано всё».
 */
export async function passStation(page: Page, number: string): Promise<void> {
	configureShopRates(number);
	await page.goto(`/crm/shop?q=${encodeURIComponent(number)}`);
	await page.getByTestId('shop-task').filter({ hasText: number }).click();
	await expect(page.getByTestId('shop-task-number')).toHaveText(number);
	await expect(page.getByTestId('shop-unit').first()).toBeVisible();
	for (const unit of await page.getByTestId('shop-unit').all()) {
		const take = unit.getByRole('button', { name: 'Взять в работу', exact: true });
		const complete = unit.getByRole('button', { name: 'Выполнено', exact: true });
		if (await take.count()) {
			await take.click();
			await expect(complete).toBeEnabled();
		}
		if (await complete.count()) {
			await complete.click();
			await expect(unit).toContainText('Выполнено ·');
		}
	}

	const done = page.getByRole('button', { name: 'Передать дальше', exact: true });
	await expect(
		done,
		(await page.getByTestId('shop-unit').allTextContents()).join('\n')
	).toBeEnabled();
	await done.click();
	await expect(page.getByTestId('shop-task-closed')).toBeVisible();
}
