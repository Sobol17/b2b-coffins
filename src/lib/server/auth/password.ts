import { randomInt } from 'node:crypto';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

// Algorithm is an ambient const enum, which verbatimModuleSyntax cannot import as a value.
const ARGON2ID = 2 as Algorithm;

// Cost floor from tech.md 12. Raising these values later is safe: `verify` reads the parameters
// back out of the stored hash string.
const ARGON2_OPTIONS = {
	algorithm: ARGON2ID,
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
} as const;

export function hashPassword(plain: string): Promise<string> {
	return hash(plain, ARGON2_OPTIONS);
}

export function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
	return verify(storedHash, plain, ARGON2_OPTIONS);
}

// Look-alike characters (l, 1, I, O, 0) are left out: the password is typed from a mail.
const PASSWORD_POOLS = [
	'abcdefghijkmnpqrstuvwxyz',
	'ABCDEFGHJKLMNPQRSTUVWXYZ',
	'23456789',
	'!#$%*-_+'
];
const TEMPORARY_PASSWORD_LENGTH = 16;

function pick(pool: string): string {
	return pool.charAt(randomInt(pool.length));
}

/**
 * Temporary password for a new portal account. One character of every class is guaranteed, so
 * the result passes the password policy, and a crypto shuffle moves them off fixed positions.
 */
export function generateTemporaryPassword(): string {
	const all = PASSWORD_POOLS.join('');
	const chars = PASSWORD_POOLS.map(pick);
	while (chars.length < TEMPORARY_PASSWORD_LENGTH) chars.push(pick(all));

	for (let i = chars.length - 1; i > 0; i -= 1) {
		const j = randomInt(i + 1);
		[chars[i], chars[j]] = [chars[j] ?? '', chars[i] ?? ''];
	}
	return chars.join('');
}
