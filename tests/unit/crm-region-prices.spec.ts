import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { ValidationError } from '../../src/lib/server/core/errors';
import { CounterpartyAccessService } from '../../src/lib/server/crm-counterparty/counterparty-access.service';
import { CounterpartyPriceService } from '../../src/lib/server/crm-counterparty/counterparty-price.service';
import { CrmCounterpartyService } from '../../src/lib/server/crm-counterparty/crm-counterparty.service';
import {
	auditLog,
	counterparties,
	priceListItems,
	priceLists,
	productVariants
} from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import { PersonalPriceResolver } from '../../src/lib/server/pricing/personal-price';
import { termsInputSchema } from '../../src/lib/validation/crm-counterparty';
import { actorOf, counterpartyDatabase, newCounterparty } from './helpers/crm-counterparty';
import { insertUser } from './helpers/db';

const db = counterpartyDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const seeded = seedPriceLists(db);
const managerId = insertUser({
	email: 'manager@region.example',
	role: 'manager',
	counterpartyId: null
});
const manager = actorOf('manager', managerId);
const SKU = 'MDL-201-180-PIN';
const OTHER_SKU = 'MDL-201-190-PIN';

function variantId(sku: string): number {
	const [row] = db
		.select({ id: productVariants.id })
		.from(productVariants)
		.where(eq(productVariants.sku, sku))
		.all();
	if (!row) throw new Error(`no variant ${sku}`);
	return row.id;
}

let regions = 0;
/** A regional list as the workshop uploads it: a price per variant. */
function region(prices: Record<string, number>): number {
	regions += 1;
	const [list] = db
		.insert(priceLists)
		.values({ title: `Иркутская область ${regions}`, isBase: false })
		.returning()
		.all();
	if (!list) throw new Error('no list');
	for (const [sku, priceMinor] of Object.entries(prices)) {
		db.insert(priceListItems)
			.values({ priceListId: list.id, variantId: variantId(sku), priceMinor })
			.run();
	}
	return list.id;
}

async function created(regionId: number | null): Promise<number> {
	const result = await new CounterpartyAccessService(manager, new FakeMailDriver()).create(
		newCounterparty({ regionPriceListId: regionId === null ? '' : String(regionId) })
	);
	return result.counterpartyId;
}

function row(counterpartyId: number) {
	const [found] = db
		.select()
		.from(counterparties)
		.where(eq(counterparties.id, counterpartyId))
		.all();
	if (!found) throw new Error('no counterparty');
	return found;
}

function tab(counterpartyId: number, sku: string) {
	const rows = new CounterpartyPriceService(manager).list(counterpartyId, {
		page: 1,
		perPage: 500,
		filters: {}
	}).rows;
	return rows.find((item) => item.variantId === variantId(sku));
}

function charged(counterpartyId: number, sku: string): number | undefined {
	const id = variantId(sku);
	return new PersonalPriceResolver().resolve(counterpartyId, new Map([[id, 1]])).get(id);
}

function terms(counterpartyId: number, regionId: number | null) {
	const current = row(counterpartyId);
	return new CrmCounterpartyService(manager).updateTerms(
		counterpartyId,
		termsInputSchema.parse({
			regionPriceListId: regionId === null ? '' : String(regionId),
			discountPercent: String(current.discountPercent),
			settlementScheme: current.settlementScheme,
			managerId: '',
			staffLimit: String(current.staffLimit)
		})
	);
}

const save = (counterpartyId: number, sku: string, priceMinor: number) =>
	new CounterpartyPriceService(manager).save(counterpartyId, [
		{ variantId: variantId(sku), priceMinor }
	]);

describe('a regional price list prefills the personal one (v1.64)', () => {
	it('copies the region into a list of the new counterparty alone', async () => {
		const irkutsk = region({ [SKU]: 950_000, [OTHER_SKU]: 990_000 });

		const id = await created(irkutsk);

		const cp = row(id);
		expect(cp.regionPriceListId).toBe(irkutsk);
		expect(cp.priceListId).not.toBeNull();
		expect(cp.priceListId).not.toBe(irkutsk);
		const [own] = db
			.select()
			.from(priceLists)
			.where(eq(priceLists.id, cp.priceListId ?? 0))
			.all();
		expect(own).toMatchObject({ isBase: false, isPersonal: true });
		expect(tab(id, SKU)).toMatchObject({ basePriceMinor: 950_000, personalPriceMinor: 950_000 });
		expect(charged(id, SKU)).toBe(950_000);
	});

	it('leaves a counterparty without a region on the base prices', async () => {
		const id = await created(null);
		expect(row(id)).toMatchObject({ regionPriceListId: null, priceListId: null });
	});

	it('shows the region in the «Базовая» column and keeps the individual price on top', async () => {
		const irkutsk = region({ [SKU]: 950_000 });
		const id = await created(irkutsk);

		save(id, SKU, 900_000);

		expect(tab(id, SKU)).toMatchObject({ basePriceMinor: 950_000, personalPriceMinor: 900_000 });
		expect(charged(id, SKU)).toBe(900_000);
	});

	it('falls back to the region when the individual price is cleared', async () => {
		const irkutsk = region({ [SKU]: 950_000 });
		const id = await created(irkutsk);

		save(id, SKU, 0);

		expect(tab(id, SKU)?.personalPriceMinor).toBeNull();
		expect(charged(id, SKU)).toBe(950_000);
	});

	it('changes only the «Базовая» column when the card moves to another region', async () => {
		const id = await created(region({ [SKU]: 950_000 }));
		save(id, SKU, 900_000);
		const angarsk = region({ [SKU]: 970_000 });

		terms(id, angarsk);

		expect(row(id).regionPriceListId).toBe(angarsk);
		expect(tab(id, SKU)).toMatchObject({ basePriceMinor: 970_000, personalPriceMinor: 900_000 });
	});

	it('prefills a counterparty that holds no list of its own when a region is set', async () => {
		const id = await created(null);

		terms(id, region({ [SKU]: 960_000 }));

		expect(row(id).priceListId).not.toBeNull();
		expect(tab(id, SKU)?.personalPriceMinor).toBe(960_000);
	});

	it('refills the personal list from the region on demand and journals it', async () => {
		const id = await created(region({ [SKU]: 950_000 }));
		save(id, SKU, 900_000);
		terms(id, region({ [SKU]: 980_000, [OTHER_SKU]: 1_010_000 }));
		const own = row(id).priceListId;

		new CounterpartyPriceService(manager).refill(id);

		expect(row(id).priceListId).toBe(own);
		expect(tab(id, SKU)?.personalPriceMinor).toBe(980_000);
		expect(tab(id, OTHER_SKU)?.personalPriceMinor).toBe(1_010_000);
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			action: 'counterparty.prices_refill',
			entityId: id
		});
	});

	it('refuses to refill without a region', async () => {
		const id = await created(null);
		expect(() => new CounterpartyPriceService(manager).refill(id)).toThrow(ValidationError);
	});

	it('takes a region only among the lists of regions: not the base, not a personal one', async () => {
		const base = seeded.get('base') ?? 0;
		await expect(created(base)).rejects.toThrow(ValidationError);
		const other = await created(region({ [SKU]: 950_000 }));
		await expect(created(row(other).priceListId)).rejects.toThrow(ValidationError);
		expect(
			new CrmCounterpartyService(manager).choices().priceLists.every((list) => list.id !== base)
		).toBe(true);
	});
});
