import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { catalogImportSchema, importCatalog } from '../../scripts/admin/catalog';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedDicts } from '../../scripts/seed/reference';
import {
	categories,
	dictItems,
	productVariants,
	products,
	stockItems
} from '../../src/lib/server/db/schema';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);

const fixture = catalogImportSchema.parse(
	JSON.parse(readFileSync(join('scripts', 'fixtures', 'catalog-angel.json'), 'utf8'))
);

function price(title: string): number | undefined {
	const [row] = db
		.select({ priceMinor: productVariants.basePriceMinor })
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.where(eq(products.title, title))
		.all();
	return row?.priceMinor;
}

function counts() {
	return {
		products: db.select().from(products).where(like(products.sku, 'ANG-%')).all().length,
		variants: db.select().from(productVariants).where(like(productVariants.sku, 'ANG-%')).all()
			.length,
		stock: db.select().from(stockItems).where(like(stockItems.code, 'ANG-%')).all().length,
		categories: db.select().from(categories).all().length
	};
}

describe('catalog import from the price list of 01.06.2026', () => {
	it('loads every line of the price list, a pair as two models with one price', () => {
		const result = importCatalog(db, fixture);

		expect(result).toEqual({ products: 78, variants: 78, hidden: 0, photos: 0 });
		expect(price('Эконом')).toBe(850_000);
		expect(price('Славянский с багетом Евро')).toBe(2_050_000);
		expect(price('Шестигранный с багетом Евро')).toBe(2_050_000);
		expect(price('Американец с узором Евро')).toBe(3_900_000);
		expect(price('Крест № 3')).toBe(370_000);
		expect(price('Крест № 4')).toBe(370_000);
		expect(price('Крестик польский')).toBe(50_000);
		const stone = db
			.select()
			.from(dictItems)
			.where(and(eq(dictItems.dict, 'material'), eq(dictItems.code, 'stone')))
			.all();
		expect(stone).toHaveLength(1);
	});

	it('leaves the same catalog on a rerun and keeps what the CRM changed', () => {
		const [lada] = db.select().from(products).where(eq(products.sku, 'ANG-0101')).all();
		db.update(products).set({ isPublished: false }).where(eq(products.sku, 'ANG-0101')).run();
		db.update(productVariants)
			.set({ costPriceMinor: 510_000 })
			.where(eq(productVariants.sku, 'ANG-0101-1'))
			.run();
		const before = counts();

		importCatalog(db, fixture);

		expect(counts()).toEqual(before);
		const [after] = db.select().from(products).where(eq(products.sku, 'ANG-0101')).all();
		expect(after).toMatchObject({ id: lada?.id, isPublished: false });
		const [variant] = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.sku, 'ANG-0101-1'))
			.all();
		expect(variant?.costPriceMinor).toBe(510_000);
	});

	it('takes the demo models off the portal only when asked', () => {
		const result = importCatalog(db, fixture, { hideOthers: true });

		expect(result.hidden).toBeGreaterThan(0);
		const demo = db.select().from(products).where(like(products.sku, 'MDL-%')).all();
		expect(demo.every((row) => !row.isPublished)).toBe(true);
		expect(db.select().from(products).where(like(products.sku, 'MDL-%')).all()).toHaveLength(
			demo.length
		);
	});

	it('writes nothing when one line of the file is broken', () => {
		const before = counts();
		const broken = {
			...fixture,
			products: [
				{ ...fixture.products[0]!, sku: 'ANG-NEW-1', title: 'Новая модель' },
				{ ...fixture.products[1]!, sku: 'ANG-NEW-2', category: 'missing' }
			]
		};

		expect(() => importCatalog(db, broken)).toThrow(/unknown category missing/);
		expect(counts()).toEqual(before);
	});
});
