import { expect, test, type Page } from '@playwright/test';
import { login } from './fixtures';
import {
	assignCrew,
	e2eDb,
	markPaidInFull,
	statusChain,
	statusOf,
	transition
} from './transitions';

const db = e2eDb();

/** The portal side of P4: a sent request is what every P5 move starts from. */
async function sendRequest(page: Page): Promise<string> {
	await login(page, 'cp_employee');
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

test('a request walks from new to paid and every step lands in the history', async ({ page }) => {
	const number = await sendRequest(page);
	assignCrew(db, number, 'carpenter', 'carpenter');
	assignCrew(db, number, 'driver', 'driver');

	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	expect(transition(number, 'ready', 'carpenter').ok).toBe(true);
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);
	// The system takes delivered -> awaiting_payment itself, so nobody moves the request there.
	expect(statusOf(db, number)).toBe('awaiting_payment');

	markPaidInFull(db, number, 'manager');
	expect(transition(number, 'paid', 'manager').ok).toBe(true);

	expect(statusOf(db, number)).toBe('paid');
	expect(statusChain(db, number)).toEqual([
		'draft->new',
		'new->in_work',
		'in_work->ready',
		'ready->delivered',
		'delivered->awaiting_payment',
		'awaiting_payment->paid'
	]);
});

test('a move the table does not list is refused and changes nothing', async ({ page }) => {
	const number = await sendRequest(page);

	const skipped = transition(number, 'ready', 'manager');

	expect(skipped.ok).toBe(false);
	expect(skipped.output).toContain('Переход недоступен');
	expect(statusOf(db, number)).toBe('new');
	expect(statusChain(db, number)).toEqual(['draft->new']);
});

test('a role the transition does not grant is refused', async ({ page }) => {
	const number = await sendRequest(page);
	assignCrew(db, number, 'carpenter', 'carpenter');

	const wrongRole = transition(number, 'in_work', 'carpenter');

	expect(wrongRole.ok).toBe(false);
	expect(wrongRole.output).toContain('not allowed: request.transition');
	expect(statusOf(db, number)).toBe('new');
});
