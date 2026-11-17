import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { AuthService } from '../../src/lib/server/auth/auth.service';
import { hashPassword } from '../../src/lib/server/auth/password';
import { rateLimits, users } from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const id = insertUser({ email: 'legacy@example.com', role: 'owner', counterpartyId: null });
const password = 'Secure!Password123';
const meta = { ip: '127.0.0.11', userAgent: null };
beforeEach(async () => {
	db.delete(rateLimits).run();
	db.update(users)
		.set({
			email: 'legacy@example.com',
			phone: null,
			passwordHash: await hashPassword(password),
			isActive: true,
			deletedAt: null,
			failedAttempts: 0,
			lockedUntil: null
		})
		.where(eq(users.id, id))
		.run();
});

describe('account phone login', () => {
	it('preserves normalized email login for legacy accounts without phones', async () => {
		await expect(
			new AuthService().login({ identifier: ' LEGACY@EXAMPLE.COM ', password }, meta)
		).resolves.toMatchObject({ scope: 'crm' });
	});
	it('authenticates email-free accounts by formatted phone', async () => {
		db.update(users).set({ email: null, phone: '+79001234567' }).where(eq(users.id, id)).run();
		await expect(
			new AuthService().login({ identifier: '8 (900) 123-45-67', password }, meta)
		).resolves.toMatchObject({ scope: 'crm' });
	});
	it('locks the same account across phone spellings after failed passwords', async () => {
		db.update(users).set({ phone: '+79001234567' }).where(eq(users.id, id)).run();
		for (let n = 0; n < 5; n++)
			await expect(
				new AuthService().login(
					{ identifier: n % 2 ? '+79001234567' : '8 (900) 123-45-67', password: 'wrong' },
					meta
				)
			).rejects.toThrow();
		expect(db.select().from(users).where(eq(users.id, id)).get()?.failedAttempts).toBe(5);
		await expect(
			new AuthService().login({ identifier: '+79001234567', password }, meta)
		).rejects.toThrow('заблокирована');
	});
	it('does not send recovery email for an email-free account', async () => {
		db.update(users).set({ email: null, phone: '+79001234567' }).where(eq(users.id, id)).run();
		const mail = new FakeMailDriver();
		await new AuthService(undefined, mail).requestReset('absent@example.com', meta.ip);
		expect(mail.sent).toHaveLength(0);
	});
});
