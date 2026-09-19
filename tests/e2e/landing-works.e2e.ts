import { expect, test } from '@playwright/test';
import { login, purchaseMoneyKeys } from './fixtures';
import { seedWorks } from './works';

const works = seedWorks();

test('a guest sees the examples of the work with their covers', async ({ page }) => {
	await page.goto('/');

	const tile = page.getByTestId('landing-work').filter({ hasText: works.title });
	await expect(tile).toHaveCount(1);
	const photo = tile.getByRole('img', { name: works.title });
	await expect(photo).toHaveAttribute('src', `/api/public/works/${works.coverMediaId}`);

	const answer = await page.request.get(`/api/public/works/${works.coverMediaId}`);
	expect(answer.status()).toBe(200);
	expect(answer.headers()['content-type']).toBe('image/png');
});

test('a guest cannot reach the photo of a hidden model or the private files route', async ({
	request
}) => {
	expect((await request.get(`/api/public/works/${works.hiddenCoverMediaId}`)).status()).toBe(404);
	expect((await request.get('/api/public/works/999999')).status()).toBe(404);
	expect((await request.get('/api/public/works/not-a-number')).status()).toBe(404);
	// The route of the portal stays closed: P13 opened one file, not the catalog.
	expect((await request.get(`/api/files/${works.coverMediaId}`)).status()).toBe(403);
});

test('a guest sees the charity project without a single collected sum', async ({ page }) => {
	await page.goto('/');

	const block = page.getByTestId('landing-charity');
	await expect(block).toContainText('Благотворительный проект');
	await expect(block).toContainText('1 %');
	await expect(block.getByRole('link', { name: 'Фонд помощи хосписам' })).toHaveAttribute(
		'href',
		'https://example.org/fund'
	);
	await expect(block).not.toContainText('₽');
	await expect(block).not.toContainText('собрано');
});

test('the landing carries no prices, no stock and no counters', async ({ page }) => {
	const body = await (await page.request.get('/__data.json')).text();

	expect(body).toContain(works.title);
	expect(purchaseMoneyKeys(body)).toEqual([]);
	expect(body).not.toContain('agencyPriceMinor');
	expect(body).not.toContain('stockQty');
	expect(body).not.toContain('publicTotalMinor');
});

test('a signed-in user goes to the contour instead of the landing', async ({ page }) => {
	await login(page, 'cp_admin');

	await page.goto('/');

	await expect(page).toHaveURL('/portal');
});
