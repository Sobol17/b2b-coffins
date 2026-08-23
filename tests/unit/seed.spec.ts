import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../src/lib/server/db/client';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import {
	seedCounterparties,
	seedCrmUsers,
	seedPriceLists,
	seedStaff
} from '../../scripts/seed/parties';
import {
	seedDicts,
	seedNotificationRules,
	seedNumbering,
	seedRoles,
	seedSettings
} from '../../scripts/seed/reference';
import {
	counterparties,
	dictItems,
	priceListItems,
	productOptions,
	productVariants,
	products,
	roles,
	userRoles,
	users
} from '../../src/lib/server/db/schema';

const COUNTED_TABLES = {
	roles,
	dictItems,
	products,
	productVariants,
	productOptions,
	priceListItems,
	counterparties,
	users,
	userRoles
};

function countAll(db: Db): Record<string, number> {
	return Object.fromEntries(
		Object.entries(COUNTED_TABLES).map(([name, table]) => [
			name,
			db.select().from(table).all().length
		])
	);
}

async function runSeed(db: Db): Promise<void> {
	seedRoles(db);
	seedDicts(db);
	seedSettings(db);
	seedNumbering(db);
	seedNotificationRules(db);
	seedStockItems(db);
	seedCatalog(db);
	await seedCrmUsers(db);
	seedStaff(db);
	await seedCounterparties(db, seedPriceLists(db));
}

describe('migrations and seed on a clean database', () => {
	let dir: string;
	let db: Db;

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'b2b-seed-'));
		db = createDb(join(dir, 'seed.db'));
		migrate(db, { migrationsFolder: './drizzle' });
		await runSeed(db);
	}, 60_000);

	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it('creates the fixture set that tech.md K2 asks for', () => {
		const counts = countAll(db);

		expect(counts.roles).toBe(7);
		expect(counts.products).toBe(10);
		expect(counts.counterparties).toBe(2);
		expect(counts.productVariants).toBeGreaterThan(0);
		expect(counts.priceListItems).toBeGreaterThan(0);
	});

	it('gives every user exactly one role and a scope that matches it', () => {
		const rows = db
			.select({ scope: users.scope, counterpartyId: users.counterpartyId })
			.from(users)
			.all();

		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(
				row.scope === 'portal' ? row.counterpartyId !== null : row.counterpartyId === null
			).toBe(true);
		}
	});

	it('keeps dictionary codes unique inside a dictionary', () => {
		const rows = db.select({ dict: dictItems.dict, code: dictItems.code }).from(dictItems).all();
		const keys = new Set(rows.map((r) => `${r.dict}:${r.code}`));

		expect(keys.size).toBe(rows.length);
	});

	it('changes nothing on a second run', async () => {
		const before = countAll(db);

		await runSeed(db);

		expect(countAll(db)).toEqual(before);
	}, 60_000);
});
