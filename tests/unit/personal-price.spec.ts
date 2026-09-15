import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import {
	counterparties,
	priceListItems,
	priceLists,
	productVariants,
	products
} from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { ProductDto } from '../../src/lib/types/catalog';
import type { RoleCode } from '../../src/lib/types/roles';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const lists = seedPriceLists(db);

function listId(code: 'base' | 'partner'): number {
	const id = lists.get(code);
	if (id === undefined) throw new Error(`price list ${code} is not seeded`);
	return id;
}

function counterpartyOn(name: string, list: 'base' | 'partner'): number {
	const [row] = db
		.insert(counterparties)
		.values({ name, priceListId: listId(list) })
		.returning()
		.all();
	if (!row) throw new Error(`failed to insert ${name}`);
	return row.id;
}

const partnerCp = counterpartyOn('Партнёр', 'partner');
const baseCp = counterpartyOn('На базовом прайсе', 'base');

function actor(role: RoleCode, counterpartyId: number | null): ActorContext {
	const roles = [role];
	return {
		userId: 1,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'personal-price-test'
	};
}

function productOf(sku: string, ctx: ActorContext): ProductDto {
	const [row] = db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).all();
	if (!row) throw new Error(`no product ${sku}`);
	return new CatalogService(ctx).get(row.id);
}

function priceOf(product: ProductDto, variantSku: string): number | undefined {
	return product.variants.find((variant) => variant.sku === variantSku)?.priceMinor;
}

function stored(variantSku: string): { id: number; basePriceMinor: number } {
	const [row] = db
		.select({ id: productVariants.id, basePriceMinor: productVariants.basePriceMinor })
		.from(productVariants)
		.where(eq(productVariants.sku, variantSku))
		.all();
	if (!row) throw new Error(`no variant ${variantSku}`);
	return row;
}

describe('personal price of a counterparty (P2)', () => {
	it('charges a partner the price of its own list where the list has an entry', () => {
		const product = productOf('MDL-201', actor('cp_admin', partnerCp));

		expect(priceOf(product, 'MDL-201-180-PIN')).toBe(830_000);
		expect(stored('MDL-201-180-PIN').basePriceMinor).not.toBe(830_000);
	});

	it('falls back to the variant price where the partner list says nothing', () => {
		const product = productOf('MDL-101', actor('cp_admin', partnerCp));

		expect(priceOf(product, 'MDL-101-180-CHB')).toBe(stored('MDL-101-180-CHB').basePriceMinor);
	});

	it('charges a counterparty on the base list the variant price', () => {
		const product = productOf('MDL-201', actor('cp_admin', baseCp));

		expect(priceOf(product, 'MDL-201-180-PIN')).toBe(stored('MDL-201-180-PIN').basePriceMinor);
	});

	it('lets a base list entry replace the variant price for everyone without an own entry', () => {
		const variant = stored('MDL-101-180-CHB');
		db.insert(priceListItems)
			.values({ priceListId: listId('base'), variantId: variant.id, priceMinor: 470_000 })
			.run();
		try {
			expect(priceOf(productOf('MDL-101', actor('cp_admin', baseCp)), 'MDL-101-180-CHB')).toBe(
				470_000
			);
			expect(priceOf(productOf('MDL-101', actor('cp_admin', partnerCp)), 'MDL-101-180-CHB')).toBe(
				470_000
			);
			expect(priceOf(productOf('MDL-201', actor('cp_admin', partnerCp)), 'MDL-201-180-PIN')).toBe(
				830_000
			);
		} finally {
			db.delete(priceListItems)
				.where(
					and(
						eq(priceListItems.priceListId, listId('base')),
						eq(priceListItems.variantId, variant.id)
					)
				)
				.run();
		}
	});

	it('stops applying a partner list once its end date has passed', () => {
		db.update(priceLists)
			.set({ validTo: new Date(Date.now() - 86_400_000) })
			.where(eq(priceLists.id, listId('partner')))
			.run();
		try {
			const product = productOf('MDL-201', actor('cp_admin', partnerCp));
			expect(priceOf(product, 'MDL-201-180-PIN')).toBe(stored('MDL-201-180-PIN').basePriceMinor);
		} finally {
			db.update(priceLists)
				.set({ validTo: null })
				.where(eq(priceLists.id, listId('partner')))
				.run();
		}
	});

	it('shows the lowest personal price on the list card', () => {
		const page = new CatalogService(actor('cp_admin', partnerCp)).list({
			page: 1,
			perPage: 5,
			search: 'MDL-201'
		});

		expect(page.rows[0]?.minPriceMinor).toBe(830_000);
	});

	it('keeps the workshop on stored prices, never on a counterparty list', () => {
		const product = productOf('MDL-201', actor('owner', null));

		expect(priceOf(product, 'MDL-201-180-PIN')).toBe(stored('MDL-201-180-PIN').basePriceMinor);
	});

	it('still gives an employee of the partner no price at all', () => {
		const body = JSON.stringify(productOf('MDL-201', actor('cp_employee', partnerCp)));

		expect(body).not.toContain('Minor');
		expect(body).not.toContain('830000');
	});
});
