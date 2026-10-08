import { expect, test, type Page } from '@playwright/test';
import { OTHER_COUNTERPARTY_ADMIN, TEMP_ACCOUNTS, login, loginAs, type RoleKey } from './fixtures';
import { openCard, sendRequest } from './portal-flow';

/*
 * Security requirements of tech.md 12 that belong to no single slice (tech.md 14, C14): the
 * temporary password, the redirect after login, the origin of endpoint calls, uploads, direct links
 * to files, the session cookie and the response headers.
 */

const ORIGIN = 'http://localhost:4173';
const FOREIGN = 'https://evil.example';
const JSON_CALL = { 'content-type': 'application/json', 'x-requested-with': 'fetch' };
const PDF = { name: 'Эскиз.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') };

async function submitLogin(page: Page, email: string, password: string): Promise<void> {
	await page.fill('input[name="email"]', email);
	await page.fill('input[name="password"]', password);
	await page.click('button[type="submit"]');
}

function upload(
	page: Page,
	requestId: string,
	file: { name: string; mimeType: string; buffer: Buffer }
) {
	return page.request.post('/api/files', {
		headers: { origin: ORIGIN, 'x-requested-with': 'XMLHttpRequest' },
		multipart: { requestId, file }
	});
}

test('a temporary password opens nothing but its own change', async ({ page }) => {
	const account = TEMP_ACCOUNTS.weakChange;
	await page.goto('/login');
	await submitLogin(page, account.email, account.password);
	await expect(page).toHaveURL('/password/change');

	// A read is sent to the change form; a write posted past it is refused outright.
	await page.goto('/crm/requests');
	await expect(page).toHaveURL('/password/change');
	const endpoint = await page.request.post('/crm/notifications/read', {
		headers: { origin: ORIGIN, ...JSON_CALL },
		data: { ids: [1] }
	});
	expect(endpoint.status()).toBe(403);
	expect(await endpoint.json()).toMatchObject({ code: 'forbidden' });
	const action = await page.request.post('/crm/board?/move', {
		headers: { origin: ORIGIN },
		form: { id: '1', to: 'in_work' }
	});
	expect(action.status()).toBe(403);
});

test('the redirect after login never leaves the host', async ({ page }) => {
	for (const target of ['//evil.example', '/\\evil.example', 'https://evil.example']) {
		await page.context().clearCookies();
		await page.goto(`/login?redirectTo=${encodeURIComponent(target)}`);
		await submitLogin(page, 'manager@workshop.example', 'Crm!Manager1');
		await expect(page, target).toHaveURL('/crm');
	}

	await page.context().clearCookies();
	await page.goto('/crm/stock');
	await expect(page).toHaveURL('/login?redirectTo=%2Fcrm%2Fstock');
	await submitLogin(page, 'manager@workshop.example', 'Crm!Manager1');
	await expect(page).toHaveURL('/crm/stock');
});

test('an endpoint refuses a call from another origin', async ({ page }) => {
	await login(page, 'manager');
	const calls = [
		{ method: 'POST', path: '/crm/notifications/read', data: { ids: [1] } },
		{ method: 'POST', path: '/api/push/subscription', data: {} },
		{ method: 'DELETE', path: '/api/push/subscription', data: {} }
	] as const;

	for (const { method, path, data } of calls) {
		for (const headers of [{ origin: FOREIGN, ...JSON_CALL }, JSON_CALL]) {
			const response = await page.request.fetch(path, { method, headers, data });
			expect(response.status(), `${method} ${path}`).toBe(403);
		}
	}
	const upload = await page.request.post('/api/files', {
		headers: { origin: FOREIGN, 'x-requested-with': 'XMLHttpRequest' },
		multipart: { requestId: '1', file: PDF }
	});
	expect(upload.status()).toBe(403);
});

test('an upload is judged by its bytes and an attachment follows its request', async ({ page }) => {
	const number = await sendRequest(page, 'cp_admin');
	await openCard(page, number);
	const requestId = new URL(page.url()).pathname.split('/').at(-1) ?? '';

	// A page that calls itself a picture, and a program: neither is stored.
	const disguised = await upload(page, requestId, {
		name: 'photo.png',
		mimeType: 'image/png',
		buffer: Buffer.from('<!doctype html><script>alert(1)</script>')
	});
	expect(disguised.status()).toBe(422);
	const program = await upload(page, requestId, {
		name: 'setup.exe',
		mimeType: 'application/x-msdownload',
		buffer: Buffer.from('MZ')
	});
	expect(program.status()).toBe(422);

	const stored = await upload(page, requestId, PDF);
	expect(stored.status()).toBe(201);
	const file = `/api/files/${((await stored.json()) as { id: number }).id}`;
	const own = await page.request.get(file);
	expect(own.status()).toBe(200);
	expect(own.headers()['content-type']).toBe('application/pdf');
	expect(own.headers()['x-content-type-options']).toBe('nosniff');

	// The other counterparty, the shop crew and the driver have no card of this request.
	await page.context().clearCookies();
	await loginAs(page, OTHER_COUNTERPARTY_ADMIN);
	expect((await page.request.get(file)).status()).toBe(403);
	for (const role of ['carpenter', 'driver'] as const satisfies readonly RoleKey[]) {
		await page.context().clearCookies();
		await login(page, role);
		expect((await page.request.get(file)).status(), role).toBe(403);
	}
	await page.context().clearCookies();
	expect((await page.request.get(file, { maxRedirects: 0 })).status()).toBe(403);
	await login(page, 'manager');
	expect((await page.request.get(file)).status()).toBe(200);
});

test('the session cookie is closed to scripts and the pages carry the headers', async ({
	page
}) => {
	await login(page, 'cp_employee');
	const session = (await page.context().cookies()).find((cookie) => cookie.name === 'sid');
	expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
	// The cookie holds a random identifier, not the account.
	expect(session?.value).not.toContain('employee');

	const headers = (await page.request.get('/portal')).headers();
	const csp = headers['content-security-policy'] ?? '';
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("object-src 'none'");
	expect(csp).not.toContain('unsafe-eval');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['strict-transport-security']).toContain('max-age=');
});

test('a refusal names no internal right and shows no stack', async ({ page }) => {
	await login(page, 'driver');
	const response = await page.goto('/crm/settings/users');
	expect(response?.status()).toBe(403);
	const body = await page.content();
	expect(body).not.toMatch(/settings\.manage|ForbiddenError|at \w+ \(.*\.js/);

	const missing = await page.request.get('/crm/delivery/nothing-here');
	expect(missing.status()).toBe(404);
	expect(await missing.text()).not.toMatch(/node_modules|\.svelte-kit/);
});
