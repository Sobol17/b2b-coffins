import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { counterparties, paymentMarks, requests, users } from '../../src/lib/server/db/schema';
import { ACCOUNTS, login, logout } from './fixtures';
import { e2eDb } from './transitions';

const ORIGIN = 'http://localhost:4173';
const OWN_PASSWORD = 'Ochen!Nadezhnyi9';

async function signIn(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await page.fill('input[name="email"]', email);
	await page.fill('input[name="password"]', password);
	await page.click('button[type="submit"]');
}

/** Payment marks are C7: until then the spec writes a handed-over request and its mark as fixtures. */
function deliverWithMark(counterpartyId: number, suffix: number): void {
	const db = e2eDb();
	const [manager] = db.select().from(users).where(eq(users.email, ACCOUNTS.manager.email)).all();
	const [row] = db
		.insert(requests)
		.values({
			number: `C3-E2E-${suffix}`,
			counterpartyId,
			createdById: manager?.id ?? 0,
			status: 'awaiting_payment',
			totalMinor: 150_000_00,
			submittedAt: new Date(),
			deliveredAt: new Date()
		})
		.returning({ id: requests.id })
		.all();
	db.insert(paymentMarks)
		.values({
			requestId: row?.id ?? 0,
			amountMinor: 40_000_00,
			paidAt: new Date(),
			method: 'bank',
			createdById: manager?.id ?? 0
		})
		.run();
}

test('C3 DoD: a manager creates a counterparty with an administrator who signs in, and the debt matches the marks', async ({
	page
}) => {
	const suffix = Date.now();
	const name = `Агентство C3 ${suffix}`;
	// global-setup disables e2e.* accounts, so reruns never pile up active seats.
	const adminEmail = `e2e.c3.${suffix}@agency.example`;

	await login(page, 'manager');
	await page.goto('/crm/counterparties');
	await page.getByRole('link', { name: 'Завести контрагента' }).click();
	await expect(page).toHaveURL('/crm/counterparties/new');
	await page.locator('input[name="name"]').fill(name);
	await page.locator('input[name="inn"]').fill('7701234567');
	await page.locator('input[name="adminFullName"]').fill('Анна Смирнова');
	await page.locator('input[name="adminEmail"]').fill(adminEmail);
	await page.getByRole('button', { name: 'Завести и отправить доступ' }).click();

	const password = (await page.getByTestId('temporary-password').textContent())?.trim() ?? '';
	expect(password.length).toBeGreaterThanOrEqual(12);
	await page.getByRole('link', { name: 'Открыть карточку контрагента' }).click();
	await expect(page.getByTestId('counterparty-name')).toHaveText(name);
	await expect(page.getByTestId('debt-indicator')).toHaveText('Долга нет');

	const counterpartyId = Number(new URL(page.url()).pathname.split('/').at(-1));
	deliverWithMark(counterpartyId, suffix);
	await page.reload();
	// 150 000 handed over minus the 40 000 mark: the indicator reads the registry below it.
	await expect(page.getByTestId('debt-indicator')).toHaveText(/Долг 110\s000 ₽ · 1 заявка/);
	await page.getByRole('tab', { name: 'Заявки и оплаты' }).click();
	const mark = page.getByTestId('data-table-row').filter({ hasText: `C3-E2E-${suffix}` });
	await expect(mark.filter({ hasText: 'Банковский перевод' })).toContainText(/40\s000/);

	await page.getByRole('tab', { name: 'Пользователи' }).click();
	await expect(page.getByTestId('data-table-row').filter({ hasText: adminEmail })).toContainText(
		'Приглашён'
	);
	await page.goto(`/crm/counterparties?search=${encodeURIComponent(name)}&hasDebt=true`);
	await expect(page.getByTestId('data-table-row').filter({ hasText: name })).toContainText(
		/110\s000/
	);

	await logout(page);
	await signIn(page, adminEmail, password);
	await expect(page).toHaveURL('/password/change');
	await page.fill('input[name="currentPassword"]', password);
	await page.fill('input[name="newPassword"]', OWN_PASSWORD);
	await page.fill('input[name="repeatPassword"]', OWN_PASSWORD);
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL(/\/login\?changed=1/);
	await signIn(page, adminEmail, OWN_PASSWORD);
	await expect(page).toHaveURL('/portal');
});

test('the card keeps contracts, addresses and a second administrator', async ({ page }) => {
	const suffix = Date.now();
	const [own] = e2eDb()
		.select()
		.from(counterparties)
		.where(eq(counterparties.name, 'Ритуал-Сервис'))
		.all();
	await login(page, 'owner');
	await page.goto(`/crm/counterparties/${own?.id ?? 0}`);

	await page.getByRole('tab', { name: 'Договоры и адреса' }).click();
	await page.getByRole('button', { name: 'Добавить договор' }).click();
	await page.getByTestId('modal').locator('input[name="number"]').fill(`C3-${suffix}`);
	await page.getByRole('button', { name: 'Сохранить договор' }).click();
	await expect(page.getByTestId('contracts')).toContainText(`№ C3-${suffix}`);

	await page.getByRole('button', { name: 'Добавить адрес' }).click();
	const address = page.getByTestId('modal');
	await address.locator('input[name="title"]').fill(`Склад ${suffix}`);
	await address.locator('input[name="address"]').fill('ул. Лесная, 5');
	await page.getByRole('button', { name: 'Сохранить адрес' }).click();
	await expect(page.getByTestId('addresses')).toContainText(`Склад ${suffix}`);

	// The seeded counterparty is shared with other specs: what this run adds, it removes.
	await page
		.getByTestId('addresses')
		.getByRole('listitem')
		.filter({ hasText: `Склад ${suffix}` })
		.getByRole('button', { name: 'Удалить' })
		.click();
	await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Удалить' }).click();
	await expect(page.getByTestId('addresses')).not.toContainText(`Склад ${suffix}`);
	await page
		.getByTestId('contracts')
		.getByRole('listitem')
		.filter({ hasText: `C3-${suffix}` })
		.getByRole('button', { name: 'Удалить' })
		.click();
	await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Удалить' }).click();
	await expect(page.getByText(`№ C3-${suffix}`)).toHaveCount(0);

	await page.getByRole('tab', { name: 'Карточка' }).click();
	await page.locator('textarea[name="notes"]').fill(`Звонить после 10, ${suffix}`);
	await page.getByRole('button', { name: 'Сохранить заметки' }).click();
	await page.reload();
	await expect(page.locator('textarea[name="notes"]')).toHaveValue(`Звонить после 10, ${suffix}`);

	// global-setup disables e2e.* accounts, so the seat is free again on the next run.
	const email = `e2e.c3admin.${suffix}@ritual-service.example`;
	await page.getByRole('tab', { name: 'Пользователи' }).click();
	await page.getByRole('button', { name: 'Выдать администратора' }).click();
	const issue = page.getByTestId('modal');
	await issue.locator('input[name="fullName"]').fill('Олег Второй');
	await issue.locator('input[name="email"]').fill(email);
	await issue.getByRole('button', { name: 'Выдать доступ' }).click();
	await expect(page.getByTestId('created-access')).toContainText('Администратор выдан');
	expect(
		(await page.getByTestId('temporary-password').textContent())?.trim().length
	).toBeGreaterThanOrEqual(12);
	await page.getByRole('tab', { name: 'Пользователи' }).click();
	await expect(page.getByTestId('data-table-row').filter({ hasText: email })).toContainText(
		'Администратор контрагента'
	);
});

test('a workshop role without the right and a portal role get 403', async ({ page }) => {
	const [own] = e2eDb()
		.select()
		.from(counterparties)
		.where(eq(counterparties.name, 'Ритуал-Сервис'))
		.all();
	const card = `/crm/counterparties/${own?.id ?? 0}`;

	await login(page, 'carpenter');
	expect((await page.goto('/crm/counterparties'))?.status()).toBe(403);
	expect((await page.goto(card))?.status()).toBe(403);
	const forged = await page.request.post('/crm/counterparties/new?/create', {
		headers: { origin: ORIGIN },
		form: { name: 'Чужой', settlementScheme: 'on_fact', discountPercent: '0' }
	});
	expect(forged.status()).toBe(403);
	await page.goto('/crm');
	await expect(page.getByRole('link', { name: 'Контрагенты' })).toHaveCount(0);
	await logout(page);

	await login(page, 'cp_admin');
	expect((await page.goto(card))?.status()).toBe(403);
});
