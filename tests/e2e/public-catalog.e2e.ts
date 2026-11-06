import { expect, test } from '@playwright/test';
import { login, purchaseMoneyKeys } from './fixtures';
import { seedCarouselWorks, seedWorks } from './works';

const works = seedWorks();
seedCarouselWorks();

test('a guest follows both landing links to the public catalog with public photos', async ({
	page
}) => {
	await page.goto('/');
	await expect(
		page.getByTestId('landing-header').getByRole('link', { name: 'Каталог', exact: true })
	).toHaveAttribute('href', '/catalog');
	await page.getByRole('link', { name: 'Смотреть все', exact: true }).click();
	await expect(page).toHaveURL('/catalog');
	await expect(page.getByRole('heading', { name: 'Каталог', exact: true })).toBeVisible();

	await page.getByLabel('Поиск').fill(works.title);
	const tile = page.getByTestId('public-catalog-product').filter({ hasText: works.title });
	await expect(tile).toHaveCount(1);
	await expect(tile.getByRole('img', { name: works.title })).toHaveAttribute(
		'src',
		`/api/public/works/${works.coverMediaId}`
	);
	expect((await page.request.get(`/api/public/works/${works.coverMediaId}`)).status()).toBe(200);
});

test('the guest catalog response contains no prices, costs or stock', async ({ request }) => {
	const response = await request.get('/catalog/__data.json');
	expect(response.status()).toBe(200);
	const body = await response.text();
	expect(body).toContain(works.title);
	expect(purchaseMoneyKeys(body)).toEqual([]);
	expect(body).not.toMatch(/"[A-Za-z]*(?:price|cost|stock)[A-Za-z]*"/i);
});

test('a signed-in price-blind worker can also browse the public catalog', async ({ page }) => {
	await login(page, 'carpenter');
	await page.goto('/catalog');
	await expect(page.getByRole('heading', { name: 'Каталог', exact: true })).toBeVisible();
	const body = await (await page.request.get('/catalog/__data.json')).text();
	expect(purchaseMoneyKeys(body)).toEqual([]);
	expect(body).not.toMatch(/"[A-Za-z]*(?:price|cost|stock)[A-Za-z]*"/i);
});

test('the landing carousel accepts keyboard navigation on a phone with reduced motion', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	const carousel = page.getByRole('region', { name: 'Примеры работ' });
	await expect(carousel).toBeVisible();
	const next = page.getByRole('button', { name: 'Следующие модели' });
	await expect(next).toBeEnabled();
	await next.focus();
	await next.press('Enter');
	await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
	const previous = page.getByRole('button', { name: 'Предыдущие модели' });
	await previous.focus();
	await previous.press('Enter');
	await expect(previous).toBeDisabled();
	await expect(
		page.getByTestId('landing-header').getByRole('link', { name: 'Каталог', exact: true })
	).toBeInViewport();
});

test('the phone catalog offers search and a call on the first screen and preserves filter paging rules', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/catalog?page=2&perPage=1');
	const search = page.getByLabel('Поиск', { exact: true });
	await expect(search).toBeVisible();
	await expect(search).toBeInViewport();
	const contact = page.getByRole('main').getByRole('link', { name: 'Связаться с фабрикой' });
	await expect(contact).toBeInViewport();
	await expect(contact).toHaveAttribute('href', /^tel:\+?\d+$/);
	expect(await contact.getAttribute('href')).toBe(
		await page.locator('footer a[href^="tel:"]').getAttribute('href')
	);

	await search.fill(works.title);
	await expect(page).toHaveURL(
		(url) =>
			url.searchParams.get('search') === works.title &&
			!url.searchParams.has('page') &&
			url.searchParams.get('perPage') === '1'
	);
	await expect(page.getByTestId('public-catalog-product')).toHaveCount(1);
	await expect(page.getByTestId('public-catalog-product')).toContainText(works.title);

	await page.getByRole('button', { name: 'Категория', exact: true }).click();
	await page.getByRole('option').first().click();
	await expect(page).toHaveURL(
		(url) => url.searchParams.has('categoryId') && url.searchParams.get('search') === works.title
	);
	await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
	await expect(page).toHaveURL(
		(url) =>
			!url.searchParams.has('search') &&
			!url.searchParams.has('categoryId') &&
			url.searchParams.get('perPage') === '1'
	);
	await expect(search).toHaveValue('');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('catalog search keeps every typed character while responses arrive late and follows browser history', async ({
	page
}) => {
	await page.goto('/catalog');
	const search = page.getByRole('searchbox', { name: 'Поиск', exact: true });
	await expect(search).toBeVisible();
	const responses: Promise<void>[] = [];
	await page.route('**/catalog/__data.json?**', (route) => {
		const response = (async () => {
			const result = await route.fetch();
			const term = new URL(route.request().url()).searchParams.get('search');
			// Earlier queries finish after the final query, as on a slow connection.
			await new Promise((resolve) => setTimeout(resolve, term === works.title ? 150 : 600));
			await route.fulfill({ response: result });
		})();
		responses.push(response);
		return response;
	});

	await search.pressSequentially(works.title, { delay: 15 });
	await expect(search).toHaveValue(works.title);
	await expect(page).toHaveURL((url) => url.searchParams.get('search') === works.title);
	await Promise.all(responses);
	await expect(search).toHaveValue(works.title);
	await expect(page.getByTestId('public-catalog-product')).toHaveCount(1);
	await expect(page.getByTestId('public-catalog-product')).toContainText(works.title);

	await page
		.getByTestId('landing-header')
		.getByRole('link', { name: 'Каталог', exact: true })
		.click();
	await expect(search).toHaveValue('');
	await page.goBack();
	await expect(search).toHaveValue(works.title);
	await page.goForward();
	await expect(search).toHaveValue('');
});
