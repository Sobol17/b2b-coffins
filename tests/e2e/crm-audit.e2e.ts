import { expect, test, type Page } from '@playwright/test';
import { count } from 'drizzle-orm';
import { auditLog } from '../../src/lib/server/db/schema';
import { enterRequest } from './crm-flow';
import { crmActions, crmScreens, readersOf, writersOf, type Screen } from './crm-surface';
import { ACCOUNTS, login, purchaseMoneyKeys, type RoleKey } from './fixtures';
import { e2eDb } from './transitions';

/*
 * Stage 2 acceptance sweep (tech.md 14, C14): every screen, export and form action of the CRM is
 * tried by each of the seven roles. Who may do what comes from tech.md 12, not from the code.
 */

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const ROLES = Object.keys(ACCOUNTS) as RoleKey[];
/** Workshop roles that never receive a price (tech.md 8.1). */
const PRICE_BLIND: readonly RoleKey[] = ['carpenter', 'painter', 'driver'];
/** The driver collects cash, so the delivery screen names the sum of a request (v1.43). */
const DRIVER_MONEY: Readonly<Record<string, readonly string[]>> = {
	'/crm/delivery': ['totalMinor']
};

let screens: Screen[] = [];

// A request card needs a request: the sweep must not depend on what earlier specs left behind.
test.beforeAll(async ({ browser }) => {
	const page = await browser.newPage();
	await login(page, 'manager');
	await enterRequest(page, `Аудит Доступа ${Date.now()}`);
	await page.close();
	screens = crmScreens(db);
});

function auditRows(): number {
	return db.select({ rows: count() }).from(auditLog).all()[0]?.rows ?? 0;
}

async function statusOf(page: Page, path: string): Promise<number> {
	return (await page.request.get(path, { maxRedirects: 0 })).status();
}

test('the sweep covers the whole CRM', () => {
	expect(screens.length).toBeGreaterThan(40);
	expect(crmActions().length).toBeGreaterThan(60);
});

for (const role of ROLES) {
	test(`${role}: every CRM screen and export answers by the right of the role`, async ({
		page
	}) => {
		await login(page, role);

		for (const screen of screens) {
			const allowed = readersOf(screen.path).includes(role);
			const expected = !allowed ? 403 : screen.exists ? 200 : 404;
			expect(await statusOf(page, screen.path), screen.path).toBe(expected);
		}
	});
}

test('a guest is sent to the login form from every CRM screen', async ({ page }) => {
	for (const screen of screens) {
		const response = await page.request.get(screen.path, { maxRedirects: 0 });
		expect(response.status(), screen.path).toBe(303);
		expect(response.headers()['location'], screen.path).toMatch(/^\/login\?redirectTo=/);
	}
});

for (const role of PRICE_BLIND) {
	test(`${role}: no data answer of the CRM carries a price`, async ({ page }) => {
		await login(page, role);
		const readable = screens.filter(
			(screen) => readersOf(screen.path).includes(role) && !screen.path.includes('.xlsx')
		);
		expect(readable.length).toBeGreaterThan(1);

		for (const { path } of readable) {
			const response = await page.request.get(`${path}/__data.json`);
			expect(response.status(), path).toBe(200);
			const allowed = role === 'driver' ? (DRIVER_MONEY[path] ?? []) : [];
			const leaked = purchaseMoneyKeys(await response.text()).filter(
				(key) => !allowed.includes(key)
			);
			expect(leaked, path).toEqual([]);
		}
	});
}

for (const role of ROLES.filter((key) => key !== 'owner')) {
	test(`${role}: a forged post reaches no action the role has no right to`, async ({ page }) => {
		await login(page, role);
		const before = auditRows();

		for (const { path, target } of crmActions()) {
			if (!readersOf(path).includes(role)) {
				const forged = await page.request.post(target, { headers: { origin: ORIGIN }, form: {} });
				expect.soft(forged.status(), target).toBe(403);
			} else if (!writersOf(path).includes(role)) {
				// The section is readable, so the refusal arrives as the answer of the action itself.
				const forged = await page.request.post(target, {
					headers: { origin: ORIGIN, accept: 'application/json' },
					form: {}
				});
				const answer = (await forged.json()) as { type: string };
				expect.soft(['failure', 'error'], target).toContain(answer.type);
			}
		}
		// Every change of the system writes its row to the journal (tech.md 12): none was made.
		expect(auditRows()).toBe(before);
	});
}

test('a guest cannot post a CRM action', async ({ page }) => {
	const before = auditRows();

	for (const { target } of crmActions()) {
		// A post that accepts JSON gets the answer of the action as `use:enhance` reads it.
		const forged = await page.request.post(target, { headers: { origin: ORIGIN }, form: {} });
		const answer = (await forged.json()) as { type: string; location?: string };
		expect.soft(answer.type, target).toBe('redirect');
		expect.soft(answer.location, target).toMatch(/^\/login\?redirectTo=/);
	}
	expect(auditRows()).toBe(before);
});
