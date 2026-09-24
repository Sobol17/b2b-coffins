import { expect, test, type Page } from '@playwright/test';

/** The primitives tech.md 9 lists. The kitchen sink has to render each of them. */
const PRIMITIVES = [
	'Button',
	'TouchButton',
	'Input',
	'Textarea',
	'NumberInput',
	'MoneyInput',
	'Select',
	'Combobox',
	'Checkbox',
	'Switch',
	'RadioGroup',
	'DatePicker',
	'DateRangePicker',
	'FileUpload',
	'DataTable',
	'FilterBar',
	'Modal',
	'Drawer',
	'ConfirmDialog',
	'Toast',
	'StatusBadge',
	'Card',
	'Tabs',
	'Breadcrumbs',
	'Pagination',
	'EmptyState',
	'Skeleton',
	'Spinner',
	'ErrorState',
	'KanbanBoard',
	'KanbanColumn',
	'KanbanCard',
	'AnimatedCounter',
	'PhotoGallery',
	'PhotoUploader',
	'PriceCell',
	'Stepper'
] as const;

async function openKitchenSink(page: Page): Promise<void> {
	await page.goto('/kitchen-sink');
	await expect(page.getByTestId('kitchen-sink')).toBeVisible();
}

test('every primitive is rendered in the kitchen sink', async ({ page }) => {
	await openKitchenSink(page);

	for (const name of PRIMITIVES) {
		await expect(page.locator(`[data-primitive="${name}"]`)).toHaveCount(1);
	}
	expect(await page.locator('[data-primitive]').count()).toBe(PRIMITIVES.length);
});

test.describe('the kit in a mobile viewport', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('keeps every touch target at 44 px or more', async ({ page }) => {
		await openKitchenSink(page);

		const targets = page.locator('[data-touch-target]');
		const count = await targets.count();
		expect(count).toBeGreaterThan(0);

		for (let index = 0; index < count; index += 1) {
			const box = await targets.nth(index).boundingBox();
			expect(box).not.toBeNull();
			expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
	});

	test('does not scroll the page sideways', async ({ page }) => {
		await openKitchenSink(page);

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});

test('the kit works from the keyboard', async ({ page }) => {
	await openKitchenSink(page);

	await page.getByTestId('open-modal').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('modal')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByTestId('modal')).toBeHidden();
	await expect(page.getByTestId('open-modal')).toBeFocused();
});

test('the toast shows an error and closes again', async ({ page }) => {
	await openKitchenSink(page);

	await page.getByTestId('toast-error').click();
	const toast = page.getByTestId('toast');
	await expect(toast).toBeVisible();
	await expect(toast).toHaveAttribute('data-kind', 'error');

	await toast.getByRole('button', { name: 'Закрыть уведомление' }).click();
	await expect(toast).toHaveCount(0);
});

test('each toast kind reads out its meaning and keeps the stack short', async ({ page }) => {
	await openKitchenSink(page);

	for (const kind of ['success', 'info', 'warning', 'error'] as const) {
		await page.getByTestId(`toast-${kind}`).click();
	}
	const region = page.getByRole('region', { name: 'Уведомления' });
	await expect(region.getByTestId('toast')).toHaveCount(4);
	await expect(region.getByRole('alert')).toContainText('Ошибка: Не удалось сохранить');
	await expect(region.getByRole('status').first()).toContainText('Готово: Заявка сохранена');

	// A second click on the same button does not stack a copy.
	await page.getByTestId('toast-error').click();
	await expect(region.getByTestId('toast')).toHaveCount(4);

	const info = region.locator('[data-kind="info"]');
	await expect(info.getByTestId('toast-description')).toHaveText(
		'Администратор примет её в работу'
	);
	await expect(info.getByRole('link', { name: 'Открыть каталог' })).toHaveAttribute(
		'href',
		'/portal/catalog'
	);
});

test('a toast under the pointer stays until the pointer leaves', async ({ page }) => {
	await page.clock.install();
	await openKitchenSink(page);

	await page.getByTestId('toast-success').click();
	const toast = page.getByTestId('toast');
	await toast.hover();
	await page.clock.runFor(10_000);
	await expect(toast).toBeVisible();

	await page.mouse.move(0, 0);
	await page.clock.runFor(10_000);
	await expect(toast).toHaveCount(0);
});

test('the registry table pages through the server query', async ({ page }) => {
	await openKitchenSink(page);

	const table = page.locator('[data-primitive="DataTable"]');
	await expect(table.getByTestId('data-table-row')).toHaveCount(3);
	const firstPage = await table.getByTestId('data-table-row').first().textContent();

	await table.getByTestId('pagination').getByRole('button', { name: 'Страница 2' }).click();

	const secondPage = await table.getByTestId('data-table-row').first().textContent();
	expect(secondPage).not.toBe(firstPage);
});

test('the money input takes whole rubles and keeps the amount in kopecks', async ({ page }) => {
	await openKitchenSink(page);

	const field = page.locator('[data-primitive="MoneyInput"] input[inputmode="numeric"]');
	await field.fill('1 234');
	await expect(page.getByTestId('money-minor')).toHaveText('123400');

	await field.fill('1234,56');
	await expect(page.locator('[data-primitive="MoneyInput"]')).toContainText(
		'Введите сумму в целых рублях'
	);
	await expect(page.getByTestId('money-minor')).toHaveText('123400');
});

test('a price that did not arrive is drawn as a dash', async ({ page }) => {
	await openKitchenSink(page);

	const cells = page.locator('[data-primitive="PriceCell"] [data-slot="price-cell"]');
	await expect(cells.nth(1)).toHaveText('—');
});
