import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedDicts } from '../../scripts/seed/reference';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import { CounterpartyPriceService } from '../../src/lib/server/crm-counterparty/counterparty-price.service';
import {
	counterparties,
	priceListItems,
	priceLists,
	products
} from '../../src/lib/server/db/schema';
import { actorOf, counterpartyDatabase } from './helpers/crm-counterparty';
import { insertUser } from './helpers/db';

const db = counterpartyDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const managerId = insertUser({
	email: 'manager@region-isolation.example',
	role: 'manager',
	counterpartyId: null
});
const manager = actorOf('manager', managerId);
const volga = db.select().from(products).where(eq(products.sku, 'MDL-201')).get()!;
const berezka = db.select().from(products).where(eq(products.sku, 'MDL-202')).get()!;
const originalPrices = [
	{ productId: volga.id, priceMinor: 950_000 },
	{ productId: berezka.id, priceMinor: 1_010_000 }
];

function world(isPersonal: boolean) {
	const region = db
		.insert(priceLists)
		.values({
			title: `Общий регион ${isPersonal}`,
			isBase: false,
			isPersonal
		})
		.returning()
		.get()!;
	db.insert(priceListItems)
		.values(originalPrices.map((row) => ({ priceListId: region.id, ...row })))
		.run();
	const [direct, regional] = db
		.insert(counterparties)
		.values([
			{ name: `Прямое назначение ${isPersonal}`, priceListId: region.id },
			{ name: `Только регион ${isPersonal}`, regionPriceListId: region.id, priceListId: null }
		])
		.returning()
		.all();
	if (!direct || !regional) throw new Error('counterparties were not inserted');
	return { region, direct, regional };
}

function pricesFor(counterpartyId: number, productId: number) {
	const catalog = new CatalogService(actorOf('cp_admin', managerId, counterpartyId));
	return [...new Set(catalog.get(productId).variants.map((variant) => variant.priceMinor))];
}

it.each([false, true])(
	'copies a list used as another counterparty region before saving personal prices (isPersonal=%s)',
	(isPersonal) => {
		const { region, direct, regional } = world(isPersonal);

		new CounterpartyPriceService(manager).save(direct.id, [
			{ productId: volga.id, priceMinor: 900_000 }
		]);

		expect(pricesFor(regional.id, volga.id)).toEqual([950_000]);
		expect(pricesFor(direct.id, volga.id)).toEqual([900_000]);
		expect(pricesFor(direct.id, berezka.id)).toEqual([1_010_000]);
		const ownListId = db
			.select()
			.from(counterparties)
			.where(eq(counterparties.id, direct.id))
			.get()!.priceListId;
		expect(ownListId).not.toBe(region.id);
		expect(db.select().from(priceLists).where(eq(priceLists.id, ownListId!)).get()).toMatchObject({
			isPersonal: true,
			isBase: false
		});
		expect(
			db
				.select({ productId: priceListItems.productId, priceMinor: priceListItems.priceMinor })
				.from(priceListItems)
				.where(eq(priceListItems.priceListId, region.id))
				.orderBy(priceListItems.productId)
				.all()
		).toEqual(originalPrices);
	}
);
