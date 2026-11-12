import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('drizzle/0027_work_rates_without_sizes.sql', 'utf8');
function fixture(secondRate = 35000) {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	db.exec(`
 CREATE TABLE product_variants(id INTEGER PRIMARY KEY, product_id INTEGER, material_id INTEGER);
 CREATE TABLE work_types(id INTEGER PRIMARY KEY, variant_id INTEGER REFERENCES product_variants(id), role_code TEXT, rate_minor INTEGER, is_active INTEGER, UNIQUE(variant_id,role_code));
 CREATE TABLE work_entries(id INTEGER PRIMARY KEY, work_type_id INTEGER REFERENCES work_types(id), rate_minor INTEGER, amount_minor INTEGER);
 CREATE TABLE shop_unit_works(id INTEGER PRIMARY KEY, work_type_id INTEGER REFERENCES work_types(id), rate_minor INTEGER);
 INSERT INTO product_variants VALUES (1,1,1),(2,1,1),(3,1,2);
 INSERT INTO work_types VALUES (10,2,'carpenter',35000,1),(11,1,'carpenter',${secondRate},1),(12,3,'carpenter',45000,1);
 INSERT INTO work_entries VALUES (1,11,12300,24600);
 INSERT INTO shop_unit_works VALUES (1,11,12300);
 `);
	return db;
}
describe('size-independent rate migration', () => {
	it('retires duplicate rates without altering historical identities or another material', () => {
		const db = fixture();
		try {
			db.transaction(() => db.exec(migration))();
			expect(db.prepare('SELECT * FROM work_types ORDER BY id').all()).toEqual([
				{ id: 10, variant_id: 2, role_code: 'carpenter', rate_minor: 35000, is_active: 0 },
				{ id: 11, variant_id: 1, role_code: 'carpenter', rate_minor: 35000, is_active: 1 },
				{ id: 12, variant_id: 3, role_code: 'carpenter', rate_minor: 45000, is_active: 1 }
			]);
			expect(db.prepare('SELECT * FROM work_entries').get()).toEqual({
				id: 1,
				work_type_id: 11,
				rate_minor: 12300,
				amount_minor: 24600
			});
			expect(db.prepare('SELECT * FROM shop_unit_works').get()).toEqual({
				id: 1,
				work_type_id: 11,
				rate_minor: 12300
			});
			expect(db.pragma('foreign_key_check')).toEqual([]);
		} finally {
			db.close();
		}
	});
	it('rolls back conflicting rates rather than choosing an arbitrary price', () => {
		const db = fixture(99000);
		try {
			expect(() => db.transaction(() => db.exec(migration))()).toThrow(/CHECK/);
			expect(db.prepare('SELECT count(*) AS n FROM work_types').get()).toEqual({ n: 3 });
			expect(db.prepare('SELECT work_type_id FROM work_entries').get()).toEqual({
				work_type_id: 11
			});
		} finally {
			db.close();
		}
	});
});
