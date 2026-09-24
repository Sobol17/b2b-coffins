import { expect, test } from '@playwright/test';
import { sendRequest } from './portal-flow';
import {
	assignCrew,
	e2eDb,
	markPaidInFull,
	statusChain,
	statusOf,
	stockUp,
	transition
} from './transitions';

const db = e2eDb();

test('a delivery that collects the cash walks the request to paid', async ({ page }) => {
	const number = await sendRequest(page, 'cp_employee');
	assignCrew(db, number, 'driver', 'driver');

	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
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
	const number = await sendRequest(page, 'cp_employee');
	assignCrew(db, number, 'driver', 'driver');

	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
	expect(transition(number, 'delivered', 'driver').ok).toBe(true);

	expect(statusOf(db, number)).toBe('awaiting_payment');
	// The manager cannot close it by hand either: the system does that off the payment marks.
	const byHand = transition(number, 'paid', 'manager');
	expect(byHand.ok).toBe(false);
	expect(byHand.output).toContain('not allowed: request.transition');
	expect(statusOf(db, number)).toBe('awaiting_payment');
});

test('a move the table does not list is refused and changes nothing', async ({ page }) => {
	const number = await sendRequest(page, 'cp_employee');

	const skipped = transition(number, 'ready', 'manager');

	expect(skipped.ok).toBe(false);
	expect(skipped.output).toContain('Переход недоступен');
	expect(statusOf(db, number)).toBe('new');
	expect(statusChain(db, number)).toEqual(['draft->new']);
});

test('a role the transition does not grant is refused', async ({ page }) => {
	const number = await sendRequest(page, 'cp_employee');

	const wrongRole = transition(number, 'in_work', 'carpenter');

	expect(wrongRole.ok).toBe(false);
	expect(wrongRole.output).toContain('not allowed: request.transition');
	expect(statusOf(db, number)).toBe('new');
});
