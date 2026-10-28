import { expect, test } from '@playwright/test';
import { login, logout } from './fixtures';

const ORIGIN = 'http://localhost:4173';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');

test('the owner uploads the transfer PDF and the counterparty opens it from the portal', async ({
	page
}) => {
	await login(page, 'owner');
	await page.goto('/crm/settings');
	const block = page.getByTestId('charity-document');
	await block.locator('input[name="file"]').setInputFiles({
		name: 'transfer.pdf',
		mimeType: 'application/pdf',
		buffer: PDF
	});
	await block.getByRole('button', { name: 'Загрузить файл' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Файл загружен' })).toBeVisible();
	const href = (await block.getByTestId('charity-document-link').getAttribute('href')) ?? '';
	expect(href).toMatch(/^\/api\/files\/\d+$/);
	await logout(page);

	await login(page, 'cp_employee');
	await page.goto('/portal');
	await expect(page.getByTestId('charity-banner').getByTestId('charity-document')).toHaveAttribute(
		'href',
		href
	);
	const file = await page.request.get(href);
	expect(file.status()).toBe(200);
	expect(file.headers()['content-type']).toBe('application/pdf');
	await logout(page);

	// The block keeps one file: removing it takes the link off the portal.
	await login(page, 'owner');
	await page.goto('/crm/settings');
	await page.getByTestId('charity-document').getByRole('button', { name: 'Удалить' }).click();
	await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Удалить' }).click();
	await expect(page.getByTestId('toast').filter({ hasText: 'Файл удалён' })).toBeVisible();
	await expect(page.getByTestId('charity-document-link')).toHaveCount(0);
	expect((await page.request.get(href)).status()).toBe(404);
});

test('a manager and a portal admin get 403 on the upload', async ({ page }) => {
	for (const role of ['manager', 'cp_admin'] as const) {
		await login(page, role);
		const response = await page.request.post('/crm/settings?/charityDocument', {
			headers: { origin: ORIGIN },
			multipart: { file: { name: 'transfer.pdf', mimeType: 'application/pdf', buffer: PDF } }
		});
		expect(response.status()).toBe(403);
		await logout(page);
	}
});
