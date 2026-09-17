import { expect, test, type Page } from '@playwright/test';
import { login } from './fixtures';

// bits-ui mirrors a select into an aria-hidden input for the form; nobody types into it.
const TYPED_FIELDS = [
	'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([aria-hidden="true"]):visible',
	'textarea:visible'
].join(', ');

/** An empty field without a sample value leaves the user guessing what goes in. */
async function expectPlaceholders(page: Page): Promise<void> {
	const fields = page.locator(TYPED_FIELDS);
	await expect(fields.first()).toBeVisible();
	const missing = await fields.evaluateAll((elements) =>
		elements
			.filter((element) => (element.getAttribute('placeholder') ?? '').trim() === '')
			.map((element) => element.getAttribute('name') ?? element.id)
	);
	expect(missing).toEqual([]);
}

test('the guest forms give every field a placeholder', async ({ page }) => {
	for (const path of ['/login', '/password/reset']) {
		await page.goto(path);
		await expectPlaceholders(page);
	}
});

test('the portal forms and filters give every field a placeholder', async ({ page }) => {
	await login(page, 'cp_admin');
	for (const path of [
		'/portal/profile',
		'/portal/requests',
		'/portal/staff',
		'/portal/prices',
		'/password/change'
	]) {
		await page.goto(path);
		await expectPlaceholders(page);
	}

	await page.goto('/portal/staff');
	await page.getByRole('button', { name: 'Добавить сотрудника' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expectPlaceholders(page);
});

test('the catalog listing and the product page give every field a placeholder', async ({
	page
}) => {
	await login(page, 'cp_employee');
	await page.goto('/portal/catalog');
	await page.getByTestId('showcase-tile').first().click();
	await expect(page).toHaveURL(/\/portal\/catalog\/product\/\d+$/);
	await expectPlaceholders(page);

	await page.goto('/portal/catalog');
	await page
		.getByTestId('category-group')
		.first()
		.getByRole('link', { name: 'Все модели группы' })
		.click();
	await expect(page).toHaveURL(/\/portal\/catalog\/\d+/);
	await expectPlaceholders(page);
});

test('the kitchen sink renders every input primitive with a placeholder', async ({ page }) => {
	await page.goto('/kitchen-sink');
	await expectPlaceholders(page);
});
