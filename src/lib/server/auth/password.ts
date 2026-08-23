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
