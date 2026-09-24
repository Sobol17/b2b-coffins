import { expect, test, type Page } from '@playwright/test';
import { enterRequest } from './crm-flow';
import { login, purchaseMoneyKeys } from './fixtures';
import { e2eDb, statusOf } from './transitions';

const ORIGIN = 'http://localhost:4173';
// Wenge is left to this spec: the portal specs order the default walnut, C4 takes black.
const COLOUR = 'Венге';

/** A request of the manager, accepted into work: the shop sees nothing before that. */
async function acceptedRequest(page: Page, qty: number): Promise<string> {
	const number = await enterRequest(page, `Орлов Олег ${Date.now()}`, COLOUR, qty);
	await page.getByRole('button', { name: 'Принять в работу' }).click();
	await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'В работе' })).toBeVisible();
	return number;
}

function queueRow(page: Page) {
	return page
		.getByTestId('shop-queue-row')
		.filter({ hasText: 'Модель «Волга»' })
		.filter({ hasText: COLOUR });
}

async function markMade(page: Page, qty: number): Promise<void> {
	const row = queueRow(page);
	await row.getByLabel('Штук').fill(String(qty));
	await row.getByRole('button', { name: 'Сделано' }).click();
	await expect(page.getByText('Выпуск отмечен')).toBeVisible();
}

test.describe('the shop floor on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('C5 DoD: marked pieces fill the request and only a full one is assembled', async ({
		page
	}) => {
		await login(page, 'manager');
		const number = await acceptedRequest(page, 2);

		await page.goto(`/crm/shop?q=${encodeURIComponent(number)}`);
		const request = page.getByTestId('shop-request').filter({ hasText: number });
		await expect(request.getByTestId('shop-fill')).toHaveText('Наполнено 0 из 2');
		await expect(request.getByRole('button', { name: 'Заявка собрана' })).toHaveCount(0);
		await expect(queueRow(page).getByTestId('shop-needed')).toHaveText('2');
		// The shop floor is a phone screen: the main action keeps the 44 px touch target.
		const made = await queueRow(page).getByRole('button', { name: 'Сделано' }).boundingBox();
		expect(made?.height ?? 0).toBeGreaterThanOrEqual(44);

		await markMade(page, 1);
		await expect(request.getByTestId('shop-fill')).toHaveText('Наполнено 1 из 2');
		await expect(queueRow(page).getByTestId('shop-needed')).toHaveText('1');

		await markMade(page, 1);
		await expect(request.getByTestId('shop-fill')).toHaveText('Наполнено 2 из 2');
		await expect(queueRow(page)).toHaveCount(0);
		// The shop floor draws no money even for a role that may see it.
		expect(purchaseMoneyKeys(await page.content())).toEqual([]);

		await request.getByRole('button', { name: 'Заявка собрана' }).click();
		await expect(page.getByText('Заявка собрана').first()).toBeVisible();
		await expect(request).toHaveCount(0);
		expect(statusOf(e2eDb(), number)).toBe('ready');
	});
});

test('C5: the server refuses to assemble a request the stock does not fill', async ({ page }) => {
	await login(page, 'manager');
	const number = await acceptedRequest(page, 3);
	const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';

	// A forged post skips the hidden button: the guard of tech.md 6.2 still says no. An action posted
	// as JSON answers HTTP 200 and carries the failure status in the body.
	const forged = await page.request.post('/crm/shop?/assemble', {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { requestId: id }
	});

	expect(await forged.json()).toMatchObject({ type: 'failure', status: 409 });
	expect(statusOf(e2eDb(), number)).toBe('in_work');
});

test('C5: the crew, the driver and the portal get 403 on the shop floor', async ({ page }) => {
	for (const role of ['carpenter', 'driver'] as const) {
		await login(page, role);
		expect((await page.goto('/crm/shop'))?.status()).toBe(403);
		const forged = await page.request.post('/crm/shop?/produce', {
			headers: { origin: ORIGIN },
			form: { variantId: '1', optionId: '', qty: '5' }
		});
		expect(forged.status()).toBe(403);
		await page.goto('/crm');
		await expect(page.getByRole('link', { name: 'Цех' })).toHaveCount(0);
		await page.context().clearCookies();
	}

	await login(page, 'cp_admin');
	expect((await page.goto('/crm/shop'))?.status()).toBe(403);
});
