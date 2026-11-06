import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { counterparties, paymentMarks, requests, users } from '../../src/lib/server/db/schema';
import { ACCOUNTS, login, logout } from './fixtures';
import { e2eDb, statusOf } from './transitions';

const ORIGIN = 'http://localhost:4173';
const DAY_MS = 86_400_000;
const db = e2eDb();

/** A counterparty of its own with two handed-over requests: 10 000 ₽ older, 20 000 ₽ newer. */
function debtor(suffix: number): { id: number; older: string; newer: string } {
	const [manager] = db.select().from(users).where(eq(users.email, ACCOUNTS.manager.email)).all();
	const [cp] = db
		.insert(counterparties)
		.values({ name: `Агентство долга ${suffix}` })
		.returning({ id: counterparties.id })
		.all();
	const id = cp?.id ?? 0;
	const request = (number: string, totalMinor: number, daysAgo: number) =>
		db
			.insert(requests)
			.values({
				number,
				counterpartyId: id,
				createdById: manager?.id ?? 0,
				status: 'awaiting_payment',
				totalMinor,
				submittedAt: new Date(Date.now() - daysAgo * DAY_MS),
				deliveredAt: new Date(Date.now() - daysAgo * DAY_MS)
			})
			.run();
	const older = `DEBT-${suffix}-1`;
	const newer = `DEBT-${suffix}-2`;
	request(older, 10_000_00, 3);
	request(newer, 20_000_00, 1);
	return { id, older, newer };
}

function marksOf(number: string): number[] {
	return db
		.select({ amount: paymentMarks.amountMinor })
		.from(paymentMarks)
		.innerJoin(requests, eq(requests.id, paymentMarks.requestId))
		.where(eq(requests.number, number))
		.all()
		.map((row) => row.amount);
}

async function openPayment(page: Page): Promise<void> {
	await page.getByRole('button', { name: /Записать оплату/ }).click();
	await expect(page.getByTestId('modal')).toBeVisible();
	await expect(page.getByTestId('debt-payment').getByLabel('Сумма, ₽')).toBeFocused();
}

async function checkRejectedPayment(page: Page): Promise<void> {
	const form = page.getByTestId('debt-payment');
	const modal = page.getByTestId('modal');
	await form.getByLabel('Сумма, ₽').fill('30 001');
	await form.getByLabel('Комментарий').fill('Частичная оплата');
	await form.getByRole('button', { name: 'Внести оплату' }).click();
	await expect(
		form.getByRole('alert').filter({ hasText: 'Сумма больше долга контрагента' })
	).toBeVisible();
	await expect(modal).toBeVisible();
	await expect(form.getByLabel('Сумма, ₽')).toHaveValue('30\u00a0001');
	await expect(form.getByLabel('Комментарий')).toHaveValue('Частичная оплата');
}

async function cancelAndReopen(page: Page): Promise<void> {
	const modal = page.getByTestId('modal');
	const form = page.getByTestId('debt-payment');
	await openPayment(page);
	await expect(form.getByLabel('Комментарий')).toHaveValue('');
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
	await openPayment(page);
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test('a payment against the whole debt closes the requests only when the debt is gone', async ({
	page
}) => {
	const { id, older, newer } = debtor(Date.now());

	await login(page, 'manager');
	await page.goto(`/crm/counterparties/${id}`);
	await expect(page.getByTestId('debt-indicator')).toContainText(/30\u00a0000 ₽ · 2 заявки/);
	const form = page.getByTestId('debt-payment');
	const modal = page.getByTestId('modal');
	const open = page.getByRole('button', { name: 'Записать оплату', exact: true });
	await expect(form).toHaveCount(0);
	await openPayment(page);
	await checkRejectedPayment(page);
	expect([marksOf(older), marksOf(newer)]).toEqual([[], []]);

	await form.getByLabel('Сумма, ₽').fill('15 000');
	await form.getByRole('button', { name: 'Внести оплату' }).click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Разнесено по заявкам: 2' })
	).toBeVisible();
	expect([marksOf(older), marksOf(newer)]).toEqual([[10_000_00], [5_000_00]]);
	expect([statusOf(db, older), statusOf(db, newer)]).toEqual([
		'awaiting_payment',
		'awaiting_payment'
	]);
	await expect(page.getByTestId('debt-indicator')).toContainText(/15\u00a0000 ₽ · 1 заявка/);
	await expect(modal).toBeHidden();
	await expect(form).toHaveCount(0);
	await expect(open).toBeFocused();
	await expect(page.getByRole('tab', { name: 'Заявки и оплаты' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await cancelAndReopen(page);

	// The untouched field carries the rest of the debt.
	await form.getByRole('button', { name: 'Внести оплату' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'закрыто заявок: 2' })).toBeVisible();
	expect([statusOf(db, older), statusOf(db, newer)]).toEqual(['paid', 'paid']);
	await expect(page.getByTestId('debt-indicator')).toHaveText('Долга нет');
	await expect(page.getByTestId('debt-payment')).toHaveCount(0);
	await expect(open).toHaveCount(0);
	await logout(page);
});

test('a driver gets 403 on the payment of a counterparty', async ({ page }) => {
	const { id } = debtor(Date.now());
	await login(page, 'driver');
	const response = await page.request.post(`/crm/counterparties/${id}?/pay`, {
		headers: { origin: ORIGIN },
		form: { amountMinor: '1000000', paidAt: '2026-10-01', method: 'bank', comment: '' }
	});
	expect(response.status()).toBe(403);
});

test('closing a pending payment cannot open another payment before the response', async ({
	page
}) => {
	const { id, older } = debtor(Date.now());
	await login(page, 'manager');
	await page.goto(`/crm/counterparties/${id}`);
	const open = page.getByRole('button', { name: /Записать оплату/ });
	await openPayment(page);
	const form = page.getByTestId('debt-payment');
	await form.getByLabel('Сумма, ₽').fill('1000');
	const responseGate = deferred();
	const held = deferred();
	await page.route(
		(url) => url.pathname === `/crm/counterparties/${id}`,
		async (route) => {
			if (route.request().method() !== 'POST') return route.continue();
			const response = await route.fetch();
			held.resolve();
			await responseGate.promise;
			await route.fulfill({ response });
		}
	);
	await form.getByRole('button', { name: 'Внести оплату', exact: true }).click();
	await held.promise;
	try {
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('modal')).toBeHidden();
		await expect(open).toBeDisabled();
	} finally {
		responseGate.resolve();
	}
	await expect(page.getByTestId('toast').filter({ hasText: 'Оплата внесена' })).toBeVisible();
	await expect(open).toBeEnabled();
	expect(marksOf(older)).toEqual([100000]);
});
