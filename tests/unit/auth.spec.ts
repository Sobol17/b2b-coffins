import { createCrmUserSchema } from '../../src/lib/validation/crm-user';
import { phoneSchema } from '../../src/lib/validation/contact';
import { describe, expect, it } from 'vitest';
import { changePasswordSchema, loginSchema, passwordSchema } from '../../src/lib/validation/auth';

describe('auth validation contract', () => {
	it('rejects a password that misses any part of the policy', () => {
		expect(passwordSchema.safeParse('short1A').success).toBe(false);
		expect(passwordSchema.safeParse('alllowercase1').success).toBe(false);
		expect(passwordSchema.safeParse('ALLUPPERCASE1').success).toBe(false);
		expect(passwordSchema.safeParse('NoDigitsAtAll').success).toBe(false);
		expect(passwordSchema.safeParse('Ochen!Nadezhnyi9').success).toBe(true);
	});

	it('refuses a new password equal to the current one', () => {
		const same = 'Ochen!Nadezhnyi9';

		const result = changePasswordSchema.safeParse({
			currentPassword: same,
			newPassword: same,
			repeatPassword: same
		});

		expect(result.success).toBe(false);
	});

	it('refuses a repeat that does not match', () => {
		const result = changePasswordSchema.safeParse({
			currentPassword: 'Staryi!Parol1',
			newPassword: 'Ochen!Nadezhnyi9',
			repeatPassword: 'Ochen!Nadezhnyi8'
		});

		expect(result.success).toBe(false);
	});

	it('accepts a login form without an optional redirect', () => {
		const result = loginSchema.safeParse({ identifier: ' A@B.example ', password: 'x' });

		expect(result.success).toBe(true);
	});

	it('rejects a login form with a malformed address', () => {
		expect(loginSchema.safeParse({ identifier: 'not-an-email', password: 'x' }).success).toBe(
			false
		);
	});
});

describe('phone account contract', () => {
	it('accepts a formatted phone as login and canonicalizes it', () => {
		expect(loginSchema.parse({ identifier: '8 (900) 123-45-67', password: 'x' }).identifier).toBe(
			'+79001234567'
		);
	});
	it('accepts an email-free account with a required normalized phone', () => {
		expect(
			createCrmUserSchema.parse({
				fullName: 'Иван Иванов',
				phone: '8 (900) 123-45-67',
				email: '',
				roles: ['driver']
			})
		).toMatchObject({ phone: '+79001234567', email: null });
	});
	it('rejects a missing account phone while retaining optional contact phones', () => {
		expect(
			createCrmUserSchema.safeParse({
				fullName: 'Иван Иванов',
				phone: '',
				email: 'a@b.example',
				roles: ['driver']
			}).success
		).toBe(false);
		expect(phoneSchema.parse('')).toBeNull();
	});
});
