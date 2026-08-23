import { expect, test, type Page, type Response } from '@playwright/test';

/*
 * The kit must not arrive whole on every page. These markers pin the two heaviest controls:
 * `gregory` comes from the calendar of @internationalized/date, `command-input-wrapper` from the
 * command palette behind the combobox. Both survive minification as string literals.
 */
const CALENDAR_MARKER = 'gregory';
const COMMAND_MARKER = 'command-input-wrapper';

function isAppScript(response: Response): boolean {
	const url = response.url();
	return url.includes('/_app/immutable/') && url.endsWith('.js');
}

function collectScripts(page: Page): Map<string, Promise<string>> {
	const bodies = new Map<string, Promise<string>>();
	page.on('response', (response) => {
		if (isAppScript(response) && !bodies.has(response.url())) {
			bodies.set(response.url(), response.text());
		}
	});
	return bodies;
}

test('the login page does not download the rest of the kit', async ({ page }) => {
	const bodies = collectScripts(page);

	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
	await page.waitForLoadState('networkidle');

	const scripts = await Promise.all(bodies.values());
	expect(scripts.length).toBeGreaterThan(0);

	const withCalendar = scripts.filter((body) => body.includes(CALENDAR_MARKER));
	const withCommand = scripts.filter((body) => body.includes(COMMAND_MARKER));

	expect(withCalendar).toHaveLength(0);
	expect(withCommand).toHaveLength(0);
});

test('the calendar arrives only when the date picker is opened', async ({ page }) => {
	const bodies = collectScripts(page);

	await page.goto('/kitchen-sink');
	await expect(page.getByTestId('kitchen-sink')).toBeVisible();
	await page.waitForLoadState('networkidle');

	const beforeOpen = await Promise.all(bodies.values());
	expect(beforeOpen.some((body) => body.includes(CALENDAR_MARKER))).toBe(false);

	await page.locator('[data-primitive="DatePicker"]').getByRole('button').click();
	await expect(page.getByRole('grid')).toBeVisible();

	const afterOpen = await Promise.all(bodies.values());
	expect(afterOpen.some((body) => body.includes(CALENDAR_MARKER))).toBe(true);
});

test('the command palette arrives only when the combobox is opened, and still picks a value', async ({
	page
}) => {
	const bodies = collectScripts(page);

	await page.goto('/kitchen-sink');
	await expect(page.getByTestId('kitchen-sink')).toBeVisible();
	await page.waitForLoadState('networkidle');

	const beforeOpen = await Promise.all(bodies.values());
	expect(beforeOpen.some((body) => body.includes(COMMAND_MARKER))).toBe(false);

	const trigger = page.locator('[data-primitive="Combobox"]').getByRole('button');
	await trigger.click();
	await page.getByRole('option', { name: 'Дуб' }).click();

	await expect(trigger).toHaveText('Дуб');

	const afterOpen = await Promise.all(bodies.values());
	expect(afterOpen.some((body) => body.includes(COMMAND_MARKER))).toBe(true);
});
