import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { normalizeAccountPhone } from '../../src/lib/validation/contact';

const migration = readFileSync('drizzle/0028_model_prices_phone_stock.sql', 'utf8');
// Exercise the checked-in SQL, including the index that must see canonical phones.
const phoneStart = migration.indexOf(
	'--> statement-breakpoint',
	migration.indexOf('UPDATE users SET email')
);
const phoneEnd = migration.indexOf(
	'--> statement-breakpoint',
	migration.indexOf('CREATE UNIQUE INDEX `users_phone_uq`')
);
const phoneMigration = migration.slice(phoneStart + '--> statement-breakpoint'.length, phoneEnd);

function legacyDatabase(phones: (string | null)[]) {
	const db = new Database(':memory:');
	db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT, deleted_at INTEGER)');
	for (const [id, phone] of phones.entries())
		db.prepare('INSERT INTO users (id, phone) VALUES (?, ?)').run(id + 1, phone);
	return db;
}

describe('legacy account phone migration', () => {
	it.each([
		'+7\u00a0(900) 123-45-67',
		'+7\t(900) 123-45-67',
		' +7 (900) 123-45-67 ',
		'+79001234567',
		'8 (900) 123-45-67',
		'9001234567',
		'+44 20 7946 0958',
		'+7\u202f(900)\n123-45-67'
	])('uses the login canonical form for %j', (legacy) => {
		const db = legacyDatabase([legacy]);
		try {
			db.transaction(() => db.exec(phoneMigration))();
			expect(db.prepare('SELECT phone FROM users').pluck().get()).toBe(
				normalizeAccountPhone(legacy)
			);
		} finally {
			db.close();
		}
	});
	it('preserves null and turns empty or formatting-only phones into null', () => {
		const db = legacyDatabase([null, '', ' \t\u00a0 ', '+ ( ) -']);
		try {
			db.transaction(() => db.exec(phoneMigration))();
			expect(db.prepare('SELECT phone FROM users ORDER BY id').pluck().all()).toEqual([
				null,
				null,
				null,
				null
			]);
		} finally {
			db.close();
		}
	});
	it('rejects colliding canonical phones and rolls back instead of selecting an account', () => {
		const phones = ['+79001234567', '+7\u00a0(900) 123-45-67'];
		const db = legacyDatabase(phones);
		try {
			expect(() => db.transaction(() => db.exec(phoneMigration))()).toThrow(
				/UNIQUE constraint failed/
			);
			expect(db.prepare('SELECT phone FROM users ORDER BY id').pluck().all()).toEqual(phones);
			expect(
				db
					.prepare(
						"SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'users_phone_uq'"
					)
					.get()
			).toBeUndefined();
		} finally {
			db.close();
		}
	});
	it('allows a deleted account to retain a phone reused by an undeleted account', () => {
		const db = legacyDatabase(['+79001234567', '+7\u00a0(900) 123-45-67']);
		try {
			db.prepare('UPDATE users SET deleted_at = 1 WHERE id = 1').run();
			db.transaction(() => db.exec(phoneMigration))();
			expect(db.prepare('SELECT phone FROM users ORDER BY id').pluck().all()).toEqual([
				'+79001234567',
				'+79001234567'
			]);
		} finally {
			db.close();
		}
	});
});
