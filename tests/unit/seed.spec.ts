import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../src/lib/server/db/client';
import { EVENT_KEYS } from '../../src/lib/types/events';
import { seedCatalog, seedStockBalances, seedStockItems } from '../../scripts/seed/catalog';
import {
	seedCounterparties,
	seedCrmUsers,
	seedPriceLists,
	seedStaff,
	seedWorkTypes
} from '../../scripts/seed/parties';
import {
	seedDicts,
	seedNotificationRules,
	seedNotificationTemplates,
	seedNumbering,
	seedRoles,
	seedSettings
} from '../../scripts/seed/reference';
import {
	counterparties,
	dictItems,
	notificationRules,
	notificationTemplates,
	options,
	priceListItems,
	productOptions,
	productVariants,
	products,
	roles,
	stockMoves,
	userRoles,
	users,
	workTypes
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
	userRoles,
	notificationRules,
	notificationTemplates,
	// Opening balances are append-only moves: a rerun must not post them twice.
	stockMoves
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
	seedNotificationTemplates(db);
	seedStockItems(db);
	seedCatalog(db);
	seedStockBalances(db);
	await seedCrmUsers(db);
	seedStaff(db);
	seedWorkTypes(db);
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

	it('gives every variant a compatibility matrix with exactly one default option', () => {
		const variants = db.select({ id: productVariants.id }).from(productVariants).all();
		const matrix = db
			.select({ variantId: productOptions.variantId, isDefault: productOptions.isDefault })
			.from(productOptions)
			.all();

		expect(variants.length).toBeGreaterThan(0);
		for (const variant of variants) {
			const rows = matrix.filter((row) => row.variantId === variant.id);
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.filter((row) => row.isDefault)).toHaveLength(1);
		}
	});

	it('offers a colour as the only option and never charges for it (v1.22)', () => {
		const rows = db
			.select({ kind: options.kind, priceDeltaMinor: options.priceDeltaMinor })
			.from(options)
			.all();

		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(row).toEqual({ kind: 'color', priceDeltaMinor: 0 });
	});

	// Mail left the event channels in v1.49; the texts of push arrive with its driver in C15.
	it('names somebody for every event of tech.md 7.3 and no mail channel', () => {
		const rules = db.select().from(notificationRules).all();

		for (const eventKey of EVENT_KEYS) {
			expect(rules.some((rule) => rule.eventKey === eventKey)).toBe(true);
		}
		expect(rules.every((rule) => rule.channel === 'push' || rule.channel === 'max')).toBe(true);
		expect(db.select().from(notificationTemplates).all()).toHaveLength(0);
	});

	it('clears the mail rows an older database still carries (v1.49)', () => {
		// The column has no CHECK, so a database seeded before v1.49 holds rows the types deny.
		db.run(
			sql`insert into notification_rules (event_key, role_code, channel, enabled)
				values ('request.ready', 'cp_admin', 'email', 1)`
		);
		db.run(
			sql`insert into notification_templates (event_key, channel, subject, body, is_active)
				values ('request.ready', 'email', 's', 'b', 1)`
		);

		seedNotificationRules(db);

		const channels = db
			.all<{ channel: string }>(
				sql`select channel from notification_rules union all select channel from notification_templates`
			)
			.map((row) => row.channel);
		expect(channels).not.toContain('email');
		expect(channels.length).toBeGreaterThan(0);
	});

	it('gives the payroll works with a price of a unit in whole roubles (v1.48)', () => {
		const works = db.select().from(workTypes).all();
		expect(works.length).toBeGreaterThan(0);
		for (const work of works) {
			expect(work.rateMinor).toBeGreaterThan(0);
			expect(work.rateMinor % 100).toBe(0);
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
