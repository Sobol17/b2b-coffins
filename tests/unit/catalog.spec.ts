import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedDicts } from '../../scripts/seed/reference';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import { ForbiddenError, NotFoundError } from '../../src/lib/server/core/errors';
import {
	categories,
	dictItems,
	media,
	options,
	productOptions,
	productVariants,
	products
} from '../../src/lib/server/db/schema';
import { PolicyService } from '../../src/lib/server/auth/policy';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { catalogFiltersSchema } from '../../src/lib/validation/catalog';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

function actorOf(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId: 1,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: PolicyService.isPortalRole(role) ? 1 : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'catalog-test'
	};
}

function productIdBySku(sku: string): number {
	const [row] = db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).all();
	if (!row) throw new Error(`no product ${sku}`);
	return row.id;
}

/** Every key of a JSON tree, so a price hidden in a nested variant or option is still caught. */
function allKeys(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(allKeys);
	if (value === null || typeof value !== 'object') return [];
	return Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)]);
}

const HIDDEN_SKU = 'HID-1';
const DELETED_SKU = 'DEL-1';

beforeAll(() => {
	// The real fixtures: the DoD of P1 is about the seed, not about hand-made rows.
	seedDicts(db);
	seedStockItems(db);
	seedCatalog(db);

	const [category] = db.select({ id: categories.id }).from(categories).all();
	const [pine] = db
		.select({ id: dictItems.id })
		.from(dictItems)
		.where(eq(dictItems.code, 'pine'))
		.all();
	for (const [sku, extra] of [
		[HIDDEN_SKU, { isPublished: false }],
		[DELETED_SKU, { isPublished: true, deletedAt: new Date() }]
	] as const) {
		db.insert(products)
			.values({ sku, title: sku, categoryId: category?.id ?? null, ...extra })
			.run();
	}

	const volgaId = productIdBySku('MDL-201');
	const [draft] = db
		.insert(productVariants)
		.values({
			productId: volgaId,
			sku: 'MDL-201-DRAFT',
			sizeCode: '210',
			materialId: pine?.id ?? 0,
			basePriceMinor: 1,
			isPublished: false
		})
		.returning()
		.all();
	const [retired] = db
		.insert(options)
		.values({ kind: 'kit', title: 'Снятый комплект', isActive: false })
		.returning()
		.all();
	const [firstVariant] = db
		.select({ id: productVariants.id })
		.from(productVariants)
		.where(eq(productVariants.sku, 'MDL-201-180-PIN'))
		.all();
	db.insert(productOptions)
		.values({ variantId: firstVariant?.id ?? 0, optionId: retired?.id ?? 0 })
		.run();
	db.insert(media)
		.values([
			{
				path: 'p/2.jpg',
				mime: 'image/jpeg',
				sizeBytes: 10,
				ownerScope: 'product',
				ownerId: volgaId,
				sortOrder: 2
			},
			{
				path: 'p/1.jpg',
				mime: 'image/jpeg',
				sizeBytes: 10,
				ownerScope: 'product',
				ownerId: volgaId,
				sortOrder: 1
			}
		])
		.run();
	expect(draft).toBeDefined();
});

describe('catalog item by role (DoD of P1)', () => {
	it('gives cp_admin the variant prices and option surcharges, but no cost', () => {
		const product = new CatalogService(actorOf('cp_admin')).get(productIdBySku('MDL-201'));

		expect(product.variants.length).toBeGreaterThan(0);
		for (const variant of product.variants) {
			expect(variant.priceMinor).toEqual(expect.any(Number));
			expect(variant).not.toHaveProperty('costPriceMinor');
			expect(variant.options.length).toBeGreaterThan(0);
			for (const option of variant.options)
				expect(option.priceDeltaMinor).toEqual(expect.any(Number));
		}
	});

	it('gives cp_employee the same item without a single money key anywhere in the body', () => {
		const admin = new CatalogService(actorOf('cp_admin')).get(productIdBySku('MDL-201'));
		const employee = new CatalogService(actorOf('cp_employee')).get(productIdBySku('MDL-201'));

		expect(allKeys(employee).filter((key) => key.includes('Minor'))).toEqual([]);
		expect(employee.variants.map((v) => v.sku)).toEqual(admin.variants.map((v) => v.sku));
	});

	it('shows the cost price to the owner alone', () => {
		const product = new CatalogService(actorOf('owner')).get(productIdBySku('MDL-201'));

		expect(product.variants.every((variant) => typeof variant.costPriceMinor === 'number')).toBe(
			true
		);
	});

	it('orders media so the first id is the cover', () => {
		const product = new CatalogService(actorOf('cp_admin')).get(productIdBySku('MDL-201'));
		const cover = db.select({ id: media.id }).from(media).where(eq(media.path, 'p/1.jpg')).all()[0];

		expect(product.mediaIds[0]).toBe(cover?.id);
	});
});

describe('publication', () => {
	it('hides a draft or deleted product from the portal as missing', () => {
		const portal = new CatalogService(actorOf('cp_admin'));

		expect(() => portal.get(productIdBySku(HIDDEN_SKU))).toThrow(NotFoundError);
		expect(() => portal.get(productIdBySku(DELETED_SKU))).toThrow(NotFoundError);
	});

	it('hides draft variants and retired options from the portal', () => {
		const product = new CatalogService(actorOf('cp_employee')).get(productIdBySku('MDL-201'));

		expect(product.variants.map((v) => v.sku)).not.toContain('MDL-201-DRAFT');
		const titles = product.variants.flatMap((v) => v.options.map((o) => o.title));
		expect(titles).not.toContain('Снятый комплект');
	});

	it('lets the manager see drafts, but never deleted positions', () => {
		const manager = new CatalogService(actorOf('manager'));

		expect(manager.get(productIdBySku(HIDDEN_SKU)).sku).toBe(HIDDEN_SKU);
		expect(manager.get(productIdBySku('MDL-201')).variants.map((v) => v.sku)).toContain(
			'MDL-201-DRAFT'
		);
		expect(() => manager.get(productIdBySku(DELETED_SKU))).toThrow(NotFoundError);
	});

	it('refuses a role without catalog.read', () => {
		expect(() => new CatalogService(actorOf('driver')).list({ page: 1, perPage: 10 })).toThrow(
			ForbiddenError
		);
	});
});

describe('catalog list', () => {
	it('pages through the published products of the seed', () => {
		const service = new CatalogService(actorOf('cp_employee'));

		const first = service.list({ page: 1, perPage: 4 });
		const third = service.list({ page: 3, perPage: 4 });

		expect(first.total).toBe(10);
		expect(first.rows).toHaveLength(4);
		expect(third.rows).toHaveLength(2);
		expect(allKeys(first).filter((key) => key.includes('Minor'))).toEqual([]);
	});

	it('gives cp_admin the lowest visible variant price per product', () => {
		const page = new CatalogService(actorOf('cp_admin')).list({
			page: 1,
			perPage: 20,
			search: 'MDL-201'
		});

		expect(page.rows).toHaveLength(1);
		expect(page.rows[0]?.minPriceMinor).toBe(
			Math.min(
				...db
					.select({ p: productVariants.basePriceMinor })
					.from(productVariants)
					.where(eq(productVariants.productId, productIdBySku('MDL-201')))
					.all()
					.filter((row) => row.p !== 1)
					.map((row) => row.p)
			)
		);
		expect(page.rows[0]?.coverMediaId).toEqual(expect.any(Number));
	});

	it('filters by category and counts only visible products in the tree', () => {
		const service = new CatalogService(actorOf('cp_admin'));
		const premium = service.categories().find((c) => c.title === 'Премиум');

		const page = service.list({ page: 1, perPage: 20, filters: { categoryId: premium?.id } });

		expect(premium?.productCount).toBe(3);
		expect(page.rows.map((row) => row.sku).sort()).toEqual(['MDL-301', 'MDL-302', 'MDL-303']);
	});

	it('reads the category filter from the query string through one schema', () => {
		expect(catalogFiltersSchema.parse({ categoryId: '3' })).toEqual({ categoryId: 3 });
		expect(catalogFiltersSchema.parse({})).toEqual({});
		expect(catalogFiltersSchema.safeParse({ categoryId: '-1' }).success).toBe(false);
		expect(catalogFiltersSchema.safeParse({ categoryId: '1 or 1=1' }).success).toBe(false);
	});
});
