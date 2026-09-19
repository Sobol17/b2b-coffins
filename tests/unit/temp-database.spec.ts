import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { temporaryUnitDatabase } from './helpers/temp-database';

describe('temporary unit database', () => {
	it('removes the directory that owns the database', () => {
		const database = temporaryUnitDatabase();
		const directory = dirname(database.path);

		expect(existsSync(directory)).toBe(true);

		database.cleanup();

		expect(existsSync(directory)).toBe(false);
	});
});
