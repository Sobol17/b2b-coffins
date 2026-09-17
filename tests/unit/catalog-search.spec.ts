import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedDicts } from '../../scripts/seed/reference';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import { products } from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);

const employee: ActorContext = {
	userId: 1,
	roles: ['cp_employee'],
	scope: 'portal',
	counterpartyId: 1,
	canSeePrices: PolicyService.canSeePrices(['cp_employee']),
	canSeeCost: false,
	requestId: 'catalog-search-test'
};

function titlesFor(search: string): string[] {
	return new CatalogService(employee)
		.list({ page: 1, perPage: 50, search })
		.rows.map((row) => row.title);
}

describe('catalog search (P3)', () => {
	it('matches Cyrillic titles regardless of case', () => {
		expect(titlesFor('лада')).toEqual(['Модель «Лада»']);
		expect(titlesFor('ЛАДА')).toEqual(['Модель «Лада»']);
	});

	it('matches an article typed in lower case', () => {
		expect(titlesFor('mdl-101')).toEqual(['Модель «Лада»']);
	});

	it('treats LIKE wildcards in the input as plain characters', () => {
		expect(titlesFor('%')).toEqual([]);
		expect(titlesFor('_')).toEqual([]);
	});

	it('never finds a hidden model for a role that does not manage the catalog', () => {
		db.update(products).set({ isPublished: false }).where(eq(products.sku, 'MDL-101')).run();
		try {
			expect(titlesFor('лада')).toEqual([]);
		} finally {
			db.update(products).set({ isPublished: true }).where(eq(products.sku, 'MDL-101')).run();
		}
	});
});
