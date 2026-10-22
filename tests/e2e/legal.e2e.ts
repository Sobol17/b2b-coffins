import { expect, test } from '@playwright/test';

const DOCS = [
	['/legal/terms', 'Пользовательское соглашение'],
	['/legal/personal-data', 'Политика обработки персональных данных'],
	['/legal/privacy', 'Политика конфиденциальности'],
	['/legal/cookies', 'Соглашение об использовании cookie']
] as const;

test('a guest reads every document with the requisites of the operator', async ({ page }) => {
	for (const [path, title] of DOCS) {
		expect((await page.goto(path))?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
		await expect(page.getByTestId('operator-details')).toContainText('Оператор');
		// Bank details stay on the server even inside the documents (tech.md 5.9, v1.56).
		await expect(page.getByTestId('operator-details')).not.toContainText('БИК');
	}
});

test('the landing footer links the four documents and names the operator', async ({ page }) => {
	await page.goto('/');
	const nav = page.getByRole('navigation', { name: 'Документы' });
	await expect(nav.getByRole('link')).toHaveText(DOCS.map(([, title]) => title));
	await expect(page.getByTestId('footer-operator')).toContainText('©');

	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Иркутск/);
	await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Ангел/);
	const ld = await page.locator('script[type="application/ld+json"]').textContent();
	expect(JSON.parse(ld ?? '{}')).toMatchObject({ '@type': 'Organization' });
});

test('the login form names the documents the user accepts', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('link', { name: 'пользовательское соглашение' })).toHaveAttribute(
		'href',
		'/legal/terms'
	);
	await expect(
		page.getByRole('link', { name: 'политику обработки персональных данных' })
	).toHaveAttribute('href', '/legal/personal-data');
});

test('the cookie notice closes once and stays closed', async ({ page }) => {
	await page.goto('/');
	const notice = page.getByTestId('cookie-notice');
	await expect(notice).toBeVisible();
	await expect(async () => {
		await notice.getByRole('button', { name: 'Понятно' }).click();
		await expect(notice).toBeHidden({ timeout: 1000 });
	}).toPass();
	await page.reload();
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(notice).toBeHidden();
});

test('robots keep the portal and the crm out of the search', async ({ request }) => {
	const body = await (await request.get('/robots.txt')).text();
	expect(body).toContain('Disallow: /portal');
	expect(body).toContain('Disallow: /crm');
});
