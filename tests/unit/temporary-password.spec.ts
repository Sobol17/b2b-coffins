import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword } from '../../src/lib/server/auth/password';
import { passwordSchema } from '../../src/lib/validation/auth';

describe('temporary password', () => {
	it('always passes the password policy it is checked against at login', () => {
		for (let run = 0; run < 500; run += 1) {
			expect(passwordSchema.safeParse(generateTemporaryPassword()).success).toBe(true);
		}
	});

	it('leaves out characters that are easy to misread from a mail', () => {
		for (let run = 0; run < 200; run += 1) {
			expect(generateTemporaryPassword()).not.toMatch(/[lIO01]/);
		}
	});

	it('does not repeat itself', () => {
		const seen = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));

		expect(seen.size).toBe(200);
	});
});
