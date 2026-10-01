import { expect, test, type Page } from '@playwright/test';
import { enterRequest } from './crm-flow';
import { login } from './fixtures';
import { e2eDb, loadUp, moneyOf, statusChain, statusOf, stockUp, transition } from './transitions';

const ORIGIN = 'http://localhost:4173';
// Mahogany is left to this spec: the portal orders walnut, C4 black, C5 wenge, C6 white.
const COLOUR = 'Красное дерево';
const db = e2eDb();

/** A request handed over without cash: the manager is on its card, the money is still owed. */
async function awaitingPayment(page: Page): Promise<{ number: string; id: string }> {
	await login(page, 'manager');
	const number = await enterRequest(page, `Орлов Олег ${Date.now()}`, COLOUR, 1);
	const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
	loadUp(db, number);
	expect(transition(number, 'delivered', 'manager').ok).toBe(true);
	expect(statusOf(db, number)).toBe('awaiting_payment');
	await page.reload();
	return { number, id };
}

async function pay(page: Page, rubles?: number): Promise<void> {
	const panel = page.getByTestId('request-payments');
	if (rubles !== undefined) await panel.getByLabel('Сумма, ₽').fill(String(rubles));
	await panel.getByRole('button', { name: 'Отметить оплату' }).click();
	await expect(page.getByText('Оплата отмечена').first()).toBeVisible();
}

test('C7 DoD: a partial payment keeps the request waiting, the rest closes it in paid', async ({
	page
}) => {
	const { number } = await awaitingPayment(page);
	const panel = page.getByTestId('request-payments');
	const { totalMinor } = moneyOf(db, number);

	await pay(page, 1000);

	await expect(panel.getByTestId('payment-marks').getByRole('listitem')).toHaveCount(1);
	expect(statusOf(db, number)).toBe('awaiting_payment');
	expect(moneyOf(db, number).marksMinor).toBe(1000_00);

	// The untouched field carries the rest with its kopecks.
	await pay(page);

	await expect(panel.getByRole('button', { name: 'Отметить оплату' })).toHaveCount(0);
	await expect(panel.getByRole('button', { name: 'Сторнировать' })).toHaveCount(0);
	expect(statusOf(db, number)).toBe('paid');
	expect(moneyOf(db, number).marksMinor).toBe(totalMinor);
	expect(statusChain(db, number).at(-1)).toBe('awaiting_payment->paid');
	await expect(page.getByTestId('request-history')).toContainText('Система');
});

test('C7: a reversal gives the rest back and leaves the mark in the list', async ({ page }) => {
	const { number } = await awaitingPayment(page);
	const panel = page.getByTestId('request-payments');
	await pay(page, 700);

	await panel.getByRole('button', { name: 'Сторнировать' }).click();
	const modal = page.getByTestId('modal');
	await modal.getByLabel('Причина').fill('Платёж другого контрагента');
	await modal.getByRole('button', { name: 'Сторнировать' }).click();

	await expect(page.getByText('Отметка сторнирована').first()).toBeVisible();
	await expect(panel.getByTestId('payment-marks').getByRole('listitem')).toHaveCount(2);
	await expect(panel.getByText('Сторнирована')).toBeVisible();
	await expect(panel.getByRole('button', { name: 'Сторнировать' })).toHaveCount(0);
	expect(moneyOf(db, number).marksMinor).toBe(0);
	expect(statusOf(db, number)).toBe('awaiting_payment');
});

test('C7: the server refuses an overpayment', async ({ page }) => {
	const { number, id } = await awaitingPayment(page);
	const { totalMinor } = moneyOf(db, number);

	const forged = await page.request.post(`/crm/requests/${id}?/pay`, {
		headers: { origin: ORIGIN, accept: 'application/json' },
		form: { amountMinor: String(totalMinor + 100_00), paidAt: '2026-01-10', method: 'bank' }
	});

	expect(await forged.json()).toMatchObject({ type: 'failure', status: 422 });
	expect(moneyOf(db, number).marksMinor).toBe(0);
});

test('C7: the crew and the portal cannot mark a payment', async ({ page }) => {
	const { number, id } = await awaitingPayment(page);
	const form = { amountMinor: '10000', paidAt: '2026-01-10', method: 'cash' };

	for (const role of ['driver', 'carpenter', 'cp_admin'] as const) {
		await page.context().clearCookies();
		await login(page, role);
		const forged = await page.request.post(`/crm/requests/${id}?/pay`, {
			headers: { origin: ORIGIN },
			form
		});
		expect(forged.status()).toBe(403);
	}
	expect(moneyOf(db, number).marksMinor).toBe(0);
	expect(statusOf(db, number)).toBe('awaiting_payment');
});
