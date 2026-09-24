import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockBalances, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import {
	categories,
	counterparties,
	dictItems,
	options,
	products
} from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { CatalogFilters } from '../../src/lib/types/catalog';
import type { RoleCode } from '../../src/lib/types/roles';
import { catalogFiltersFromUrl, catalogSortFromUrl } from '../../src/lib/validation/catalog';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
seedStockBalances(db);
const lists = seedPriceLists(db);
const [partner] = db
	.insert(counterparties)
	.values({ name: 'Партнёр', priceListId: lists.get('partner') ?? null })
	.returning()
	.all();
const partnerId = partner?.id ?? 0;

function actor(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId: 1,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: PolicyService.isPortalRole(role) ? partnerId : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'storefront-test'
	};
}

function one<T>(rows: T[], what: string): T {
	const [row] = rows;
	if (row === undefined) throw new Error(`missing ${what}`);
	return row;
}

const materialId = (code: string) =>
	one(
		db
			.select({ id: dictItems.id })
			.from(dictItems)
			.where(and(eq(dictItems.dict, 'material'), eq(dictItems.code, code)))
			.all(),
		code
	).id;
const categoryId = (title: string) =>
	one(
		db.select({ id: categories.id }).from(categories).where(eq(categories.title, title)).all(),
		title
	).id;
const productId = (sku: string) =>
	one(db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).all(), sku).id;
const colorId = (title: string) =>
	one(db.select({ id: options.id }).from(options).where(eq(options.title, title)).all(), title).id;

function skus(filters: CatalogFilters, role: RoleCode = 'cp_employee'): string[] {
	return new CatalogService(actor(role))
		.list({ page: 1, perPage: 50, filters })
		.rows.map((row) => row.sku)
		.sort();
}

describe('storefront filters (P3)', () => {
	it('filters by material', () => {
		expect(skus({ materialIds: [materialId('oak')] })).toEqual(['MDL-301', 'MDL-302']);
	});

	it('requires one variant to satisfy every filter at once', () => {
		// Pine models exist in 190 cm and there is a pine 200 cm, but only MDL-201 has that variant.
		expect(skus({ materialIds: [materialId('pine')], lengthFromMm: 2000 })).toEqual(['MDL-201']);
	});

	it('filters by colour through the compatibility matrix', () => {
		expect(skus({ colorOptionIds: [colorId('Белый')] })).toEqual([
			'MDL-101',
			'MDL-102',
			'MDL-103',
			'MDL-201',
			'MDL-202'
		]);
	});

	it('includes the models of subcategories in a parent category', () => {
		const economy = categoryId('Эконом');
		const [child] = db
			.insert(categories)
			.values({ title: 'Эконом: детские', parentId: economy })
			.returning()
			.all();
		db.update(products)
			.set({ categoryId: child?.id ?? null })
			.where(eq(products.sku, 'MDL-103'))
			.run();
		try {
			expect(skus({ categoryId: economy })).toEqual(['MDL-101', 'MDL-102', 'MDL-103']);
			const tree = new CatalogService(actor('cp_employee')).categories();
			expect(tree.find((c) => c.id === economy)?.productCount).toBe(3);
			expect(tree.find((c) => c.id === child?.id)?.productCount).toBe(1);
		} finally {
			db.update(products).set({ categoryId: economy }).where(eq(products.sku, 'MDL-103')).run();
			db.delete(categories)
				.where(eq(categories.id, child?.id ?? 0))
				.run();
		}
	});
});

describe('storefront cards and prices', () => {
	it('describes a card with materials, lengths and the stock of its variants', () => {
		const [card] = new CatalogService(actor('cp_employee')).list({
			page: 1,
			perPage: 5,
			search: 'MDL-201'
		}).rows;

		expect(card).toMatchObject({
			materialTitles: ['Сосна'],
			lengthsMm: [1800, 1900, 2000],
			variantCount: 3
		});
		// The storefront shows no stock (tech.md v1.42): not even a zero goes out.
		expect(card).not.toHaveProperty('stockQty');
		expect(JSON.stringify(card)).not.toContain('Minor');
	});

	it('sends no stock of a variant to the product page (v1.42)', () => {
		const product = new CatalogService(actor('cp_admin')).get(productId('MDL-101'));

		expect(product.variants.length).toBeGreaterThan(0);
		for (const variant of product.variants) expect(variant).not.toHaveProperty('stockQty');
	});

	it('sorts by the personal price for the administrator', () => {
		const rows = new CatalogService(actor('cp_admin')).list({
			page: 1,
			perPage: 50,
			sort: 'price',
			dir: 'asc'
		}).rows;
		const prices = rows.map((row) => row.minPriceMinor ?? Number.POSITIVE_INFINITY);

		expect(rows).toHaveLength(10);
		expect(prices).toEqual([...prices].sort((a, b) => a - b));
		expect(rows[0]?.sku).toBe('MDL-101');
	});

	it('pages a price-sorted list without losing or repeating a model', () => {
		const service = new CatalogService(actor('cp_admin'));
		const pages = [1, 2, 3].flatMap(
			(page) => service.list({ page, perPage: 4, sort: 'price', dir: 'desc' }).rows
		);

		expect(new Set(pages.map((row) => row.id)).size).toBe(10);
		expect(service.list({ page: 1, perPage: 4, sort: 'price' }).total).toBe(10);
	});

	it('ignores a price sort for a role without prices, so the order leaks nothing', () => {
		const service = new CatalogService(actor('cp_employee'));
		const byPrice = service
			.list({ page: 1, perPage: 50, sort: 'price' })
			.rows.map((row) => row.sku);
		const byCatalog = service.list({ page: 1, perPage: 50 }).rows.map((row) => row.sku);

		expect(byPrice).toEqual(byCatalog);
	});

	it('gives each category the lowest personal price inside it, to the administrator only', () => {
		const premium = categoryId('Премиум');
		// Partner list: MDL-301-190-OAK 23 100 ₽; base prices: MDL-303-190-ASH 22 400 ₽ is lower.
		expect(
			new CatalogService(actor('cp_admin')).categories().find((c) => c.id === premium)
				?.minPriceMinor
		).toBe(2_240_000);
		expect(
			new CatalogService(actor('cp_employee')).categories().find((c) => c.id === premium)
		).not.toHaveProperty('minPriceMinor');
	});

	it('builds facets of a category from its visible variants', () => {
		const facets = new CatalogService(actor('cp_employee')).facets(categoryId('Премиум'));

		expect(facets.materials).toEqual([
			{ id: materialId('oak'), title: 'Дуб', productCount: 2 },
			{ id: materialId('ash'), title: 'Ясень', productCount: 1 }
		]);
		expect(facets.colors.map((color) => color.title)).toEqual(['Красное дерево', 'Орех', 'Чёрный']);
		expect(facets.lengthMm).toEqual({ min: 1900, max: 2000 });
	});

	it('offers other models of the same category as similar positions', () => {
		const similar = new CatalogService(actor('cp_employee')).similar(productId('MDL-201'));

		expect(similar.map((row) => row.sku).sort()).toEqual(['MDL-202', 'MDL-203', 'MDL-204']);
	});

	it('answers an unknown category as missing', () => {
		expect(() => new CatalogService(actor('cp_employee')).category(999_999)).toThrow('not found');
	});
});

describe('storefront query string', () => {
	it('reads repeated ids and centimetres, and ignores the stock flag of old links', () => {
		const url = new URL(
			'https://portal.example/portal/catalog/1?material=2&material=5&color=7&lengthFrom=180&lengthTo=200&inStock=1'
		);

		expect(catalogFiltersFromUrl(url)).toEqual({
			materialIds: [2, 5],
			colorOptionIds: [7],
			lengthFromMm: 1800,
			lengthToMm: 2000
		});
	});

	it('drops tampered values instead of failing the page', () => {
		const url = new URL(
			'https://portal.example/portal/catalog/1?material=oak&material=-3&lengthFrom=1e9&inStock=yes&sort=cost'
		);

		expect(catalogFiltersFromUrl(url)).toEqual({});
		expect(catalogSortFromUrl(url)).toBe('sortOrder');
	});
});
