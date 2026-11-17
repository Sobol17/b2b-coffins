import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import { PriceListExportService } from '../../src/lib/server/catalog/price-list-export.service';
import { CounterpartyPriceService } from '../../src/lib/server/crm-counterparty/counterparty-price.service';
import { CrmPricingService } from '../../src/lib/server/crm-pricing/crm-pricing.service';
import { counterparties, products } from '../../src/lib/server/db/schema';
import { actorOf } from './helpers/crm-counterparty';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const lists = seedPriceLists(db);
const cp = db
	.insert(counterparties)
	.values({ name: 'Единые цены', priceListId: lists.get('partner')! })
	.returning()
	.get()!;

describe('one price per model', () => {
	it('excludes archived models from the editable price list', () => {
		const product = db.select().from(products).where(eq(products.sku, 'MDL-201')).get()!;
		db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, product.id)).run();
		try {
			const list = new CrmPricingService(actorOf('owner', 1)).getPriceList(lists.get('partner')!);
			expect(list.items.some((row) => row.productId === product.id)).toBe(false);
		} finally {
			db.update(products).set({ deletedAt: null }).where(eq(products.id, product.id)).run();
		}
	});
	it('quotes the same regional or personal price for every size', () => {
		const product = db.select().from(products).where(eq(products.sku, 'MDL-201')).get()!;
		const dto = new CatalogService(actorOf('cp_admin', 1, cp.id)).get(product.id);
		expect(dto.variants.map((row) => row.priceMinor)).toEqual([830000, 830000, 830000]);
	});

	it('offers one editable personal-price row per model', () => {
		const rows = new CounterpartyPriceService(actorOf('owner', 1)).list(cp.id, {
			page: 1,
			perPage: 100
		}).rows;
		expect(rows.filter((row) => row.productTitle === 'Модель «Волга»')).toHaveLength(1);
	});

	it('exports one model SKU and price instead of duplicate sizes', () => {
		const lines = new PriceListExportService(actorOf('cp_admin', 1, cp.id)).lines();
		expect(lines.filter((row) => row.productTitle === 'Модель «Волга»')).toHaveLength(1);
		expect(lines.find((row) => row.productTitle === 'Модель «Волга»')?.sku).toBe('MDL-201');
	});
});
