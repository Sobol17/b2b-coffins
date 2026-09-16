import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { AgencyPriceService } from '../../src/lib/server/pricing/agency-price.service';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import {
	auditLog,
	counterpartyProductPrices,
	productVariants,
	products
} from '../../src/lib/server/db/schema';
import { RequestCardService } from '../../src/lib/server/request/request-card.service';
import { DraftService } from '../../src/lib/server/request/draft.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { AgencyPriceFilters } from '../../src/lib/types/pricing';
import { migratedDatabase } from './helpers/db';
import { portalActor, resetRequests, seedOrderingWorld } from './helpers/portal-requests';
import { send } from './helpers/registry';

const db = migratedDatabase();
const world = seedOrderingWorld(db);

const admin = portalActor('cp_admin', world.adminId, world.cpId);
const employee = portalActor('cp_employee', world.employeeId, world.cpId);
const outsider = portalActor('cp_admin', world.outsiderId, world.otherCpId);
const manager = portalActor('manager', 1, null);

function page(filters: AgencyPriceFilters = {}) {
	return normalizeListQuery<AgencyPriceFilters>({ filters, perPage: 50 });
}

function moneyKeys(value: unknown): string[] {
	const found: string[] = [];
	const walk = (node: unknown): void => {
		if (Array.isArray(node)) return node.forEach(walk);
		if (node === null || typeof node !== 'object') return;
		for (const [key, child] of Object.entries(node)) {
			if (key.includes('Minor') || key.includes('discountPercent')) found.push(key);
			walk(child);
		}
	};
	walk(value);
	return found;
}

let productId: number;

beforeEach(() => {
	db.delete(counterpartyProductPrices).run();
	resetRequests(db);
	const [first] = db.select({ id: products.id }).from(products).limit(1).all();
	productId = first?.id ?? 0;
});

describe('agency prices of a counterparty (P7)', () => {
	it('lets the administrator set a price and reads it back on the page', () => {
		const service = new AgencyPriceService(admin);
		expect(service.save([{ productId, priceMinor: 250_000 }])).toEqual({
			updated: 1,
			cleared: 0
		});
		const row = service.list(page()).rows.find((candidate) => candidate.productId === productId);
		expect(row?.agencyPriceMinor).toBe(250_000);
		// The purchase price stays next to it: the administrator compares the two.
		expect(row?.minPurchasePriceMinor).toBeGreaterThan(0);
	});

	it('records the change in the journal with the models it touched', () => {
		new AgencyPriceService(admin).save([{ productId, priceMinor: 250_000 }]);
		const [entry] = db.select().from(auditLog).where(eq(auditLog.action, 'agency_price.set')).all();
		expect(entry?.entity).toBe('counterparty_product_price');
		expect(entry?.entityId).toBe(world.cpId);
		expect(entry?.after).toEqual({ updated: [productId], cleared: [] });
	});

	it('writes nothing when the same page is submitted twice', () => {
		const service = new AgencyPriceService(admin);
		service.save([{ productId, priceMinor: 250_000 }]);
		expect(service.save([{ productId, priceMinor: 250_000 }])).toEqual({
			updated: 0,
			cleared: 0
		});
		expect(db.select().from(counterpartyProductPrices).all()).toHaveLength(1);
	});

	it('clears a price when the field comes back empty', () => {
		const service = new AgencyPriceService(admin);
		service.save([{ productId, priceMinor: 250_000 }]);
		expect(service.save([{ productId, priceMinor: 0 }])).toEqual({ updated: 0, cleared: 1 });
		expect(db.select().from(counterpartyProductPrices).all()).toHaveLength(0);
	});

	it('refuses a model outside the catalog', () => {
		expect(() =>
			new AgencyPriceService(admin).save([{ productId: 999_999, priceMinor: 1 }])
		).toThrow('Неизвестная позиция');
	});

	it('keeps the screen away from an employee', () => {
		expect(() => new AgencyPriceService(employee).list(page())).toThrow('prices.manage');
		expect(() => new AgencyPriceService(employee).save([{ productId, priceMinor: 1 }])).toThrow(
			'prices.manage'
		);
	});

	it('keeps the price inside its own counterparty', () => {
		new AgencyPriceService(admin).save([{ productId, priceMinor: 250_000 }]);
		const theirs = new AgencyPriceService(outsider)
			.list(page())
			.rows.find((row) => row.productId === productId);
		expect(theirs?.agencyPriceMinor).toBeUndefined();
	});
});

describe('agency price in the catalog', () => {
	beforeEach(() => {
		new AgencyPriceService(admin).save([{ productId, priceMinor: 250_000 }]);
	});

	function listFor(ctx: ActorContext) {
		return new CatalogService(ctx).list(normalizeListQuery({ perPage: 50 }));
	}

	it('shows the employee the agency price and no purchase price', () => {
		const row = listFor(employee).rows.find((candidate) => candidate.id === productId);
		expect(row?.agencyPriceMinor).toBe(250_000);
		expect(row?.minPriceMinor).toBeUndefined();
	});

	it('shows the administrator both numbers', () => {
		const row = listFor(admin).rows.find((candidate) => candidate.id === productId);
		expect(row?.agencyPriceMinor).toBe(250_000);
		expect(row?.minPriceMinor).toBeGreaterThan(0);
	});

	it('puts the price on the product card and on its category', () => {
		const product = new CatalogService(employee).get(productId);
		expect(product.agencyPriceMinor).toBe(250_000);
		const category = new CatalogService(employee)
			.categories()
			.find((row) => row.id === product.categoryId);
		expect(category?.agencyMinPriceMinor).toBe(250_000);
		expect(category?.minPriceMinor).toBeUndefined();
	});

	it('never sends an agency price to the workshop', () => {
		const row = listFor(manager).rows.find((candidate) => candidate.id === productId);
		expect(row?.agencyPriceMinor).toBeUndefined();
	});

	it('sorts the employee catalog by the agency price and puts models without one last', () => {
		const sorted = new CatalogService(employee).list(
			normalizeListQuery({ perPage: 50, sort: 'price', dir: 'asc' })
		);
		expect(sorted.rows[0]?.id).toBe(productId);
		expect(sorted.rows.at(-1)?.agencyPriceMinor).toBeUndefined();
	});
});

describe('agency price in the cart and in the request', () => {
	let variant: number;

	beforeEach(() => {
		const [row] = db
			.select({ id: productVariants.id })
			.from(productVariants)
			.where(eq(productVariants.productId, productId))
			.limit(1)
			.all();
		variant = row?.id ?? 0;
		new AgencyPriceService(admin).save([{ productId, priceMinor: 250_000 }]);
	});

	it('gives the employee a price per piece and no sums at all', () => {
		new DraftService(employee).addItem({ variantId: variant, qty: 3, optionIds: [] });
		const cart = new DraftService(employee).current();
		expect(cart?.items[0]?.agencyUnitPriceMinor).toBe(250_000);
		expect(moneyKeys(cart)).toEqual(['agencyUnitPriceMinor']);
	});

	it('gives the employee the same price in the card of a sent request', () => {
		const requestId = send(employee, variant);
		const card = new RequestCardService(employee).card(requestId);
		expect(card.items[0]?.agencyUnitPriceMinor).toBe(250_000);
		expect(moneyKeys(card)).toEqual(['agencyUnitPriceMinor']);
	});

	it('leaves the totals of the administrator untouched by the agency price', () => {
		const requestId = send(admin, variant);
		const before = new RequestCardService(admin).card(requestId);
		new AgencyPriceService(admin).save([{ productId, priceMinor: 999_999 }]);
		const after = new RequestCardService(admin).card(requestId);
		expect(after.totalMinor).toBe(before.totalMinor);
		expect(after.itemsTotalMinor).toBe(before.itemsTotalMinor);
		expect(after.items[0]?.agencyUnitPriceMinor).toBe(999_999);
	});
});
