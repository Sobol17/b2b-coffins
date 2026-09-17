import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { SiteSearchService } from '../../src/lib/server/search/site-search.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { siteSearchQuerySchema } from '../../src/lib/validation/search';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
seedPriceLists(db);

function actor(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId: 1,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: PolicyService.isPortalRole(role) ? 1 : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'site-search-test'
	};
}

describe('header search hints', () => {
	it('finds catalog groups and models by a Cyrillic word in any case', () => {
		const found = new SiteSearchService(actor('cp_admin')).find('ЭКОНОМ');

		expect(found.categories.map((category) => category.title)).toEqual(['Эконом']);
		expect(new SiteSearchService(actor('cp_admin')).find('лада').products).toEqual([
			{ id: expect.any(Number), sku: 'MDL-101', title: 'Модель «Лада»' }
		]);
	});

	it('caps the hints at six models', () => {
		expect(new SiteSearchService(actor('cp_employee')).find('модель').products).toHaveLength(6);
	});

	it('answers with the same price-free keys to both portal roles', () => {
		for (const role of ['cp_admin', 'cp_employee'] as const) {
			const found = new SiteSearchService(actor(role)).find('модель');
			for (const product of found.products) {
				expect(Object.keys(product).sort()).toEqual(['id', 'sku', 'title']);
			}
			for (const category of found.categories) {
				expect(Object.keys(category).sort()).toEqual(['id', 'title']);
			}
		}
	});

	it('refuses a role without catalog.read', () => {
		const blind = actor('cp_employee');
		expect(PolicyService.can(actor('driver'), 'catalog.read')).toBe(false);
		expect(() => new SiteSearchService({ ...blind, roles: ['driver'] }).find('лада')).toThrow(
			ForbiddenError
		);
	});

	it('rejects a query too short or too long to be a search', () => {
		expect(siteSearchQuerySchema.safeParse({ q: ' л ' }).success).toBe(false);
		expect(siteSearchQuerySchema.safeParse({ q: 'л'.repeat(65) }).success).toBe(false);
		expect(siteSearchQuerySchema.parse({ q: '  лада ' })).toEqual({ q: 'лада' });
	});
});
