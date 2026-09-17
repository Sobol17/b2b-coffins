import { expect, test, type Page } from '@playwright/test';
import {
	OTHER_COUNTERPARTY_ADMIN,
	login,
	loginAs,
	logout,
	purchaseMoneyKeys,
	type RoleKey
} from './fixtures';
import { openCard, sendRequest } from './portal-flow';
import { e2eDb, statusOf } from './transitions';

/*
 * Stage 1 acceptance sweep (tech.md 14, P9): every portal screen is walked by both portal roles
 * for price leaks, direct links, the phone layout and the basics of accessibility.
 */

const db = e2eDb();
const ORIGIN = 'http://localhost:4173';
const PHONE = { width: 360, height: 780 };

interface PortalPaths {
	readonly all: string[];
	readonly adminOnly: string[];
}

/** Real ids from the seed and from a request the role just sent. */
async function portalPaths(page: Page, role: 'cp_admin' | 'cp_employee'): Promise<PortalPaths> {
	const number = await sendRequest(page, role);
	await openCard(page, number);
	const card = new URL(page.url()).pathname;

	await page.goto('/portal/catalog');
	const category = await page
		.locator('a[href^="/portal/catalog/"]:not([href*="product"]):not([href$=".xlsx"])')
		.first()
		.getAttribute('href');
	const product = await page.getByTestId('showcase-tile').first().getAttribute('href');

	return {
		all: [
			'/portal',
			'/portal/catalog',
			...(category ? [category] : []),
			...(product ? [product] : []),
			'/portal/cart',
			'/portal/requests',
			card,
			'/portal/profile',
			'/portal/profile/notifications'
		],
		adminOnly: ['/portal/prices', '/portal/staff']
	};
}

async function horizontalOverflow(page: Page): Promise<number> {
	return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Controls a screen reader would announce without a name. */
async function unnamedControls(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const controls = document.querySelectorAll<HTMLElement>(
			'input:not([type="hidden"]), select, textarea, button, [role="checkbox"], [role="radio"], [role="combobox"], a[href]'
		);
		const named = (el: HTMLElement): boolean => {
			if (el.getAttribute('aria-label')?.trim()) return true;
			const labelledBy = el.getAttribute('aria-labelledby');
			if (
				labelledBy &&
				labelledBy.split(' ').some((id) => document.getElementById(id)?.textContent?.trim())
			) {
				return true;
			}
			if ('labels' in el && (el as HTMLInputElement).labels?.length) return true;
			if (el.title.trim()) return true;
			return (
				(el.textContent ?? '').trim().length > 0 ||
				el.querySelector('img[alt]:not([alt=""])') !== null
			);
		};
		return (
			[...controls]
				// bits-ui mirrors each control into an aria-hidden native input for form posts.
				.filter(
					(el) => el.offsetParent !== null && !el.closest('[aria-hidden="true"]') && !named(el)
				)
				.map((el) => el.outerHTML.slice(0, 120))
		);
	});
}

for (const role of ['cp_admin', 'cp_employee'] as const satisfies readonly RoleKey[]) {
	test(`${role}: every portal screen opens, fits a phone and names its controls`, async ({
		page
	}) => {
		const paths = await portalPaths(page, role);
		await page.setViewportSize(PHONE);

		for (const path of paths.all) {
			const response = await page.goto(path);
			expect(response?.status(), path).toBe(200);
			await expect(page.locator('h1'), path).toHaveCount(1);
			expect(await horizontalOverflow(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
			expect(await unnamedControls(page), path).toEqual([]);
			await expect(page.locator('img:not([alt])'), path).toHaveCount(0);
		}
	});
}

test('cp_employee: no screen and no data answer carries a purchase price', async ({ page }) => {
	const paths = await portalPaths(page, 'cp_employee');

	for (const path of paths.all) {
		const response = await page.request.get(`${path.replace(/\/$/, '')}/__data.json`);
		expect(response.status(), path).toBe(200);
		expect(purchaseMoneyKeys(await response.text()), path).toEqual([]);
	}
	for (const path of paths.adminOnly) {
		expect((await page.goto(path))?.status(), path).toBe(403);
	}
	expect((await page.request.get('/portal/catalog/price-list.xlsx')).status()).toBe(403);
});

test('cp_admin: the admin screens open and the purchase prices do arrive', async ({ page }) => {
	const paths = await portalPaths(page, 'cp_admin');

	for (const path of paths.adminOnly) {
		expect((await page.goto(path))?.status(), path).toBe(200);
	}
	const card = paths.all.find((path) => /^\/portal\/requests\/\d+$/.test(path));
	const body = await (await page.request.get(`${card}/__data.json`)).text();
	expect(body).toMatch(/"(unitPriceMinor|totalMinor)"/);
});

test('another counterparty reaches none of the requests by a direct link', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');
	await openCard(page, number);
	const card = new URL(page.url()).pathname;
	await logout(page);

	await loginAs(page, OTHER_COUNTERPARTY_ADMIN);

	expect((await page.goto(card))?.status()).toBe(403);
	// SvelteKit answers a data request with 200 and puts the refusal of the load into the body.
	const data = await (await page.request.get(`${card}/__data.json`)).text();
	expect(data).toContain('"status":403');
	expect(data).not.toContain(number);
	for (const action of ['comment', 'cancel']) {
		// An action call answers 200 with the refusal inside, the way `use:enhance` reads it.
		const response = await page.request.post(`${card}?/${action}`, {
			headers: { origin: ORIGIN, accept: 'application/json' },
			form: { body: 'Чужой комментарий' }
		});
		const answer = (await response.json()) as { type: string; status: number; data: string };
		expect(answer, action).toMatchObject({ type: 'failure', status: 403 });
		expect(answer.data, action).toContain('Недостаточно прав');
		expect(answer.data, action).not.toContain('request.read');
	}
	expect(statusOf(db, number)).toBe('new');

	await page.goto('/portal/requests');
	await expect(page.getByTestId('request-row').filter({ hasText: number })).toHaveCount(0);
	await page.goto('/portal/profile/notifications');
	await expect(page.getByTestId('data-table-row').filter({ hasText: number })).toHaveCount(0);
});

test('the portal header is reachable from the keyboard', async ({ page }) => {
	await login(page, 'cp_employee');

	const catalog = page.getByRole('link', { name: 'Каталог' }).first();
	for (let presses = 0; presses < 15; presses += 1) {
		await page.keyboard.press('Tab');
		if (await catalog.evaluate((el) => el === document.activeElement)) break;
	}
	await expect(catalog).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/portal\/catalog$/);
	expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
});
