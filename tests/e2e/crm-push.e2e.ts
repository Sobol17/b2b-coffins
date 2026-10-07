import { expect, test, type Page } from '@playwright/test';
import { desc, eq } from 'drizzle-orm';
import { auditLog, notifications, pushSubscriptions, users } from '../../src/lib/server/db/schema';
import { ACCOUNTS, login, logout, purchaseMoneyKeys, type RoleKey } from './fixtures';
import { sendRequest } from './portal-flow';
import { e2eDb, stockUp, transition } from './transitions';

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const QUEUE_TIMEOUT = 15_000;
const API = '/api/push/subscription';
const TEMPLATES = '/crm/settings/notifications/templates';
const LOG = '/crm/settings/notifications/log';
const JSON_HEADERS = {
	origin: ORIGIN,
	'content-type': 'application/json',
	'x-requested-with': 'fetch'
};
const device = (name: string) => ({
	endpoint: `https://push.example/e2e/${name}`,
	p256dh: 'k',
	auth: 'a'
});

const userId = (role: RoleKey): number =>
	db.select().from(users).where(eq(users.email, ACCOUNTS[role].email)).all()[0]?.id ?? 0;

/** Other specs count channel rows from zero, so this one leaves no device and no row behind. */
function clean(): void {
	db.delete(pushSubscriptions).run();
	db.delete(notifications).run();
}

async function readyRequest(page: Page): Promise<string> {
	const number = await sendRequest(page, 'cp_admin');
	await logout(page);
	expect(transition(number, 'in_work', 'manager').ok).toBe(true);
	stockUp(db, number);
	expect(transition(number, 'ready', 'manager').ok).toBe(true);
	return number;
}

test.beforeEach(clean);
test.afterAll(clean);

test('C15: the driver gets a push the moment a request is ready, the owner sees it in the log', async ({
	page
}) => {
	await login(page, 'driver');
	const subscribed = await page.request.post(API, {
		headers: JSON_HEADERS,
		data: device('driver')
	});
	expect(subscribed.status()).toBe(200);
	expect(await subscribed.json()).toMatchObject({ deviceCount: 1 });
	await logout(page);

	const number = await readyRequest(page);

	await expect(async () => {
		const rows = db
			.select()
			.from(notifications)
			.where(eq(notifications.userId, userId('driver')))
			.all();
		expect(rows.map((row) => `${row.eventKey} ${row.status}`)).toEqual(['request.ready sent']);
	}).toPass({ timeout: QUEUE_TIMEOUT });

	await login(page, 'owner');
	await page.goto(LOG);
	const line = page
		.getByTestId('delivery-log')
		.getByTestId('data-table-row')
		.filter({ hasText: number });
	await expect(line).toHaveCount(1);
	await expect(line).toContainText('Заявка готова к выдаче');
	await expect(line.getByTestId('delivery-status')).toHaveText('Отправлено');
	const body = await (await page.request.get(`${LOG}/__data.json`)).text();
	expect(body).toContain(number);
	expect(purchaseMoneyKeys(body)).toEqual([]);
});

test('C15: a person without a device gets the bell and no push row', async ({ page }) => {
	await readyRequest(page);
	await login(page, 'driver');

	await expect(async () => {
		await page.goto('/crm');
		await expect(page.getByTestId('bell-count')).toBeVisible({ timeout: 500 });
	}).toPass({ timeout: QUEUE_TIMEOUT });
	expect(db.select().from(notifications).all()).toEqual([]);
});

test('C15: the owner edits a template, previews it and the change is audited', async ({ page }) => {
	await login(page, 'owner');
	await page.goto(TEMPLATES);
	await expect(page.getByTestId('template-card')).toHaveCount(10);
	const card = page.getByTestId('template-card').filter({ hasText: 'Заявка готова к выдаче' });
	const text = card.getByLabel('Текст');
	const saved = page.getByTestId('toast').filter({ hasText: 'Шаблон сохранён' });

	await text.fill('Заберите заявку {{number}}');
	await expect(card.getByTestId('template-preview')).toContainText('Заберите заявку 2026-0042');
	await card.getByTestId('template-save').click();
	await expect(saved).toBeVisible();

	await page.reload();
	await expect(text).toHaveValue('Заберите заявку {{number}}');
	const [entry] = db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1).all();
	expect(entry?.action).toBe('notifications.template.update');

	await text.fill('Сумма {{totalMinor}}');
	await expect(card.getByTestId('template-preview')).toContainText('переменная, которой нет');
	await card.getByTestId('template-save').click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Переменной нет у этого события' })
	).toBeVisible();

	// Back to the seeded text: the next run and the other specs start from it.
	await text.fill('Изделия готовы к выдаче');
	await card.getByTestId('template-save').click();
	await expect(saved.last()).toBeVisible();
	await page.reload();
	await expect(text).toHaveValue('Изделия готовы к выдаче');
});

test('C15: the test send asks for a device first and then reaches it', async ({ page }) => {
	await login(page, 'owner');
	await page.goto(TEMPLATES);
	const card = page.getByTestId('template-card').first();

	await card.getByTestId('template-test').click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Включите уведомления на этом устройстве' })
	).toBeVisible();

	await page.request.post(API, { headers: JSON_HEADERS, data: device('owner') });
	await card.getByTestId('template-test').click();
	await expect(
		page.getByTestId('toast').filter({ hasText: 'Отправлено на устройств: 1' })
	).toBeVisible();
	expect(db.select().from(notifications).all()).toEqual([]);
});

test('C15: templates and the log answer 403 to the administrator and the driver', async ({
	page
}) => {
	for (const role of ['manager', 'driver'] as const) {
		await login(page, role);
		expect((await page.goto(TEMPLATES))?.status()).toBe(403);
		expect((await page.goto(LOG))?.status()).toBe(403);
		const forged = await page.request.post(`${TEMPLATES}?/save`, {
			headers: { origin: ORIGIN },
			form: { eventKey: 'request.ready', title: 'x', body: 'y', isActive: 'on' }
		});
		expect(forged.status()).toBe(403);
		// The error page has no header to log out from.
		await page.goto('/crm');
		await logout(page);
	}
});

test('C15: the subscription endpoint serves both contours and refuses the rest', async ({
	page
}) => {
	const guest = await page.request.post(API, {
		headers: JSON_HEADERS,
		data: device('guest'),
		maxRedirects: 0
	});
	expect(guest.status()).toBe(303);

	await login(page, 'cp_employee');
	const portal = await page.request.post(API, { headers: JSON_HEADERS, data: device('portal') });
	expect(portal.status()).toBe(200);
	const bad = await page.request.post(API, {
		headers: JSON_HEADERS,
		data: { endpoint: 'http://x' }
	});
	expect(bad.status()).toBe(400);
	const plain = await page.request.post(API, {
		headers: { origin: ORIGIN, 'content-type': 'application/json' },
		data: device('portal')
	});
	expect(plain.status()).toBe(403);
	await logout(page);

	await login(page, 'manager');
	const foreign = await page.request.delete(API, {
		headers: JSON_HEADERS,
		data: { endpoint: device('portal').endpoint }
	});
	expect(foreign.status()).toBe(404);
	expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
});

test('C15: the personal page says so when push is not configured', async ({ page }) => {
	await login(page, 'driver');
	await page.goto('/crm/notifications');

	// The e2e server runs without VAPID keys, so the device can never be subscribed here.
	await expect(page.getByTestId('push-toggle')).toContainText(
		'Уведомления на устройства пока не настроены'
	);
	await expect(page.getByTestId('push-enable')).toHaveCount(0);
	await page.goto('/crm/delivery');
	await expect(page.getByRole('heading', { name: 'Доставка' })).toBeVisible();
	await expect(page.getByTestId('push-banner')).toHaveCount(0);
});

test('C15: the settings section walks between the matrix, the templates and the log', async ({
	page
}) => {
	await login(page, 'owner');
	await page.goto('/crm/settings/notifications');
	const tabs = page.getByTestId('notification-tabs');

	await expect(tabs.getByRole('link', { name: 'Матрица' })).toHaveAttribute('aria-current', 'page');
	await tabs.getByRole('link', { name: 'Шаблоны' }).click();
	await expect(page).toHaveURL(TEMPLATES);
	await tabs.getByRole('link', { name: 'Журнал отправок' }).click();
	await expect(page).toHaveURL(LOG);
	await expect(tabs.getByRole('link', { name: 'Журнал отправок' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});
