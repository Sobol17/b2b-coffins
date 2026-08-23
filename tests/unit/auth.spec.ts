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
		const result = loginSchema.safeParse({ email: 'a@b.example', password: 'x' });

		expect(result.success).toBe(true);
	});

	it('rejects a login form with a malformed address', () => {
		expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
	});
});
