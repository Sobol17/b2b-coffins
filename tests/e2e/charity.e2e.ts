import { expect, test, type Page } from '@playwright/test';
import {
	charityAmountOf,
	insertReadyStockRequest,
	setCharityRate,
	settledFundTotal,
	totalOf
} from './charity';
import { login, purchaseMoneyKeys } from './fixtures';
import { openCard, sendRequest, submitRequest } from './portal-flow';
import { assignCrew, e2eDb, statusOf, transition } from './transitions';
import { formatMinor } from '../../src/lib/utils/format';

const db = e2eDb();
const LIVE_TIMEOUT = 15_000;

/** A sent request, walked by the crew up to the driver's hands. */
function toReady(number: string): string {
	assignCrew(db, number, 'carpenter', 'carpenter');
	assignCrew(db, number, 'driver', 'driver');
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	expect(transition(number, 'ready', 'carpenter').ok).toBe(true);
	return number;
}

async function readyRequest(page: Page): Promise<string> {
	return toReady(await sendRequest(page, 'cp_admin'));
}

function deliver(number: string): void {
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);
}

test('the counter grows on delivery without a page reload', async ({ page }) => {
	const number = await readyRequest(page);
	const before = await settledFundTotal(db);

	await page.goto('/portal');
	const banner = page.getByTestId('charity-banner');
	await expect(banner.getByTestId('charity-total')).toContainText(formatMinor(before));
	// A full navigation would drop this marker: the number has to arrive over the stream.
	await page.evaluate(() => Object.assign(window, { stillTheSamePage: true }));

	deliver(number);
	const amount = charityAmountOf(db, number);
	expect(amount).toBe(Math.round(totalOf(db, number) / 100));

	await expect(banner.getByTestId('charity-total')).toContainText(
		formatMinor(before + (amount ?? 0)),
		{
			timeout: LIVE_TIMEOUT
		}
	);
	expect(await page.evaluate(() => 'stillTheSamePage' in window)).toBe(true);
	expect(await settledFundTotal(db)).toBe(before + (amount ?? 0));
});

test('a new rate leaves the amounts already fixed where they were', async ({ page }) => {
	const first = await readyRequest(page);
	deliver(first);
	const frozen = charityAmountOf(db, first);
	expect(frozen).not.toBeNull();

	const second = toReady(await submitRequest(page));
	setCharityRate(db, 500);
	try {
		deliver(second);
	} finally {
		setCharityRate(db, 100);
	}

	expect(charityAmountOf(db, first)).toBe(frozen);
	expect(charityAmountOf(db, second)).toBe(Math.round(totalOf(db, second) / 20));

	await openCard(page, first);
	await expect(page.getByTestId('request-charity')).toContainText(formatMinor(frozen));
	await expect(page.getByTestId('request-charity')).toContainText('В фонд с этой заявки');
});

test('cancelled requests and stock requests stay out of the counter', async ({ page }) => {
	const before = await settledFundTotal(db);

	const cancelled = await sendRequest(page, 'cp_admin');
	expect(transition(cancelled, 'cancelled', 'cp_admin').ok).toBe(true);
	const stock = insertReadyStockRequest(db);
	deliver(stock);

	expect(statusOf(db, cancelled)).toBe('cancelled');
	expect(statusOf(db, stock)).toBe('awaiting_payment');
	expect(charityAmountOf(db, cancelled)).toBeNull();
	expect(charityAmountOf(db, stock)).toBeNull();
	expect(await settledFundTotal(db)).toBe(before);

	await page.goto('/portal');
	await expect(page.getByTestId('charity-total')).toContainText(formatMinor(before));
});

test('the admin sees the own contribution next to the public counter', async ({ page }) => {
	await login(page, 'cp_admin');
	await page.goto('/portal');

	const banner = page.getByTestId('charity-banner');
	await expect(banner.getByTestId('charity-fund')).toContainText('Фонд помощи хосписам');
	await expect(banner.getByTestId('charity-own')).toContainText('Вклад ваших заявок');
	await expect(banner.getByTestId('charity-year')).toBeVisible();
	await expect(banner.getByTestId('charity-count')).toHaveText(/\d+/);
});

test('an employee sees the public counter and no purchase figure', async ({ page }) => {
	const number = toReady(await sendRequest(page, 'cp_employee'));
	deliver(number);

	await page.goto('/portal');
	await expect(page.getByTestId('charity-total')).toBeVisible();
	await expect(page.getByTestId('charity-own')).toHaveCount(0);
	const home = await (await page.request.get('/portal/__data.json')).text();
	expect(home).toContain('publicTotalMinor');
	expect(purchaseMoneyKeys(home)).toEqual([]);

	await openCard(page, number);
	await expect(page.getByTestId('request-charity')).toHaveCount(0);
	const path = new URL(page.url()).pathname;
	const card = await (await page.request.get(`${path}/__data.json`)).text();
	expect(purchaseMoneyKeys(card)).toEqual([]);
});

test('a workshop role gets 403 on the portal banner', async ({ page }) => {
	await login(page, 'manager');

	const response = await page.goto('/portal');
	expect(response?.status()).toBe(403);
	await expect(page.getByTestId('charity-banner')).toHaveCount(0);
});
