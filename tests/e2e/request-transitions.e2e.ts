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

test('a delivery that collects the cash walks the request to paid', async ({ page }) => {
	const number = await sendRequest(page);
	assignCrew(db, number, 'carpenter', 'carpenter');
	assignCrew(db, number, 'driver', 'driver');

	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	expect(transition(number, 'ready', 'carpenter').ok).toBe(true);
	// The cash the driver takes at the door, the way the C6 checkbox will write it.
	markPaidInFull(db, number, 'driver');
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);

	// Nobody moves the request past delivered: the system chains both automatic steps.
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

test('a delivery billed by invoice stops at awaiting_payment', async ({ page }) => {
	const number = await sendRequest(page);
	assignCrew(db, number, 'carpenter', 'carpenter');
	assignCrew(db, number, 'driver', 'driver');

	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	expect(transition(number, 'ready', 'carpenter').ok).toBe(true);
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);

	expect(statusOf(db, number)).toBe('awaiting_payment');
	// The manager cannot close it by hand either: the system does that off the payment marks.
	const byHand = transition(number, 'paid', 'manager');
	expect(byHand.ok).toBe(false);
	expect(byHand.output).toContain('not allowed: request.transition');
	expect(statusOf(db, number)).toBe('awaiting_payment');
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
