import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { CounterpartyPriceService } from '../../src/lib/server/crm-counterparty/counterparty-price.service';
import {
	auditLog,
	counterparties,
	priceListItems,
	priceLists,
	productVariants,
	products
} from '../../src/lib/server/db/schema';
import { PersonalPriceResolver } from '../../src/lib/server/pricing/personal-price';
import type { RoleCode } from '../../src/lib/types/roles';
import { actorOf, counterpartyDatabase } from './helpers/crm-counterparty';
import { insertUser } from './helpers/db';

const db = counterpartyDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const lists = seedPriceLists(db);
const managerId = insertUser({
	email: 'manager@prices.example',
	role: 'manager',
	counterpartyId: null
});
const manager = actorOf('manager', managerId);
const service = () => new CounterpartyPriceService(manager);
const page = { page: 1, perPage: 200 };

function listId(code: 'base' | 'partner'): number {
	const id = lists.get(code);
	if (id === undefined) throw new Error(`price list ${code} is not seeded`);
	return id;
}

function counterpartyOn(name: string, priceListId: number | null): number {
	const [row] = db.insert(counterparties).values({ name, priceListId }).returning().all();
	if (!row) throw new Error(`failed to insert ${name}`);
	return row.id;
}

function variant(sku: string): { id: number; productId: number; basePriceMinor: number } {
	const [row] = db
		.select({
			id: productVariants.id,
			productId: products.id,
			basePriceMinor: products.basePriceMinor
		})
		.from(productVariants)
		.innerJoin(products, eq(products.id, productVariants.productId))
		.where(eq(productVariants.sku, sku))
		.all();
	if (!row) throw new Error(`no variant ${sku}`);
	return row;
}

/** What the counterparty is charged, through the same resolver the cart and the catalog use. */
function charged(counterpartyId: number, sku: string): number {
	const { id, basePriceMinor } = variant(sku);
	return (
		new PersonalPriceResolver().resolve(counterpartyId, new Map([[id, basePriceMinor]])).get(id) ??
		0
	);
}

function listOf(counterpartyId: number): number | null {
	const [row] = db
		.select({ priceListId: counterparties.priceListId })
		.from(counterparties)
		.where(eq(counterparties.id, counterpartyId))
		.all();
	return row?.priceListId ?? null;
}

function auditRows(counterpartyId: number) {
	return db
		.select()
		.from(auditLog)
		.where(
			and(eq(auditLog.action, 'counterparty.prices_update'), eq(auditLog.entityId, counterpartyId))
		)
		.all();
}

describe('individual prices of a counterparty (v1.56)', () => {
	it('gives a counterparty on the base list a list of its own and charges the new price', () => {
		const cp = counterpartyOn('На базовом', listId('base'));
		const neighbour = counterpartyOn('Сосед на базовом', listId('base'));
		const lada = variant('MDL-101-180-CHB');

		const result = service().save(cp, [{ productId: lada.productId, priceMinor: 450_000 }]);

		expect(result).toEqual({ updated: 1, cleared: 0 });
		expect(listOf(cp)).not.toBe(listId('base'));
		expect(charged(cp, 'MDL-101-180-CHB')).toBe(450_000);
		expect(charged(neighbour, 'MDL-101-180-CHB')).toBe(lada.basePriceMinor);
		const [list] = db
			.select()
			.from(priceLists)
			.where(eq(priceLists.id, listOf(cp) ?? 0))
			.all();
		expect(list).toMatchObject({ isBase: false, title: 'Индивидуальные цены: На базовом' });
	});

	it('copies a shared list before the change, so the other holders keep their prices', () => {
		const cp = counterpartyOn('Партнёр А', listId('partner'));
		const other = counterpartyOn('Партнёр Б', listId('partner'));
		const volga = variant('MDL-201-190-PIN');

		service().save(cp, [{ productId: volga.productId, priceMinor: 800_000 }]);

		expect(listOf(other)).toBe(listId('partner'));
		expect(charged(other, 'MDL-201-190-PIN')).toBe(830_000);
		expect(charged(cp, 'MDL-201-190-PIN')).toBe(800_000);
		// The whole model changes, while another model keeps its copied price.
		expect(charged(cp, 'MDL-201-180-PIN')).toBe(800_000);
		expect(charged(cp, 'MDL-202-180-BIR')).toBe(895_000);
	});

	it('writes into the list the counterparty already holds alone', () => {
		const cp = counterpartyOn('Свой прайс', null);
		const lada = variant('MDL-101-180-CHB');
		service().save(cp, [{ productId: lada.productId, priceMinor: 440_000 }]);
		const own = listOf(cp);
		const before = db.select().from(priceLists).all().length;

		service().save(cp, [{ productId: lada.productId, priceMinor: 430_000 }]);

		expect(listOf(cp)).toBe(own);
		expect(db.select().from(priceLists).all().length).toBe(before);
		expect(charged(cp, 'MDL-101-180-CHB')).toBe(430_000);
	});

	it('clears a price with zero and lists the base one again', () => {
		const cp = counterpartyOn('Очистка', null);
		const lada = variant('MDL-101-190-CHB');
		service().save(cp, [{ productId: lada.productId, priceMinor: 400_000 }]);

		expect(service().save(cp, [{ productId: lada.productId, priceMinor: 0 }])).toEqual({
			updated: 0,
			cleared: 1
		});

		expect(charged(cp, 'MDL-101-190-CHB')).toBe(lada.basePriceMinor);
		const row = service()
			.list(cp, page)
			.rows.find((entry) => entry.productId === lada.productId);
		expect(row).toMatchObject({ basePriceMinor: lada.basePriceMinor, personalPriceMinor: null });
	});

	it('writes nothing and makes no list on a resubmit or an empty page', () => {
		const cp = counterpartyOn('Повтор', listId('base'));
		const lada = variant('MDL-101-180-CHB');
		expect(service().save(cp, [{ productId: lada.productId, priceMinor: 0 }])).toEqual({
			updated: 0,
			cleared: 0
		});
		expect(listOf(cp)).toBe(listId('base'));

		service().save(cp, [{ productId: lada.productId, priceMinor: 420_000 }]);
		service().save(cp, [{ productId: lada.productId, priceMinor: 420_000 }]);

		expect(auditRows(cp)).toHaveLength(1);
		expect(auditRows(cp)[0]?.actorId).toBe(managerId);
	});

	it('shows the base price and the own one of every model once on the tab', () => {
		const cp = counterpartyOn('Просмотр', listId('partner'));
		const rows = service().list(cp, page).rows;
		const volga = rows.find((row) => row.sku === 'MDL-201');
		const lada = rows.find((row) => row.sku === 'MDL-101');

		expect(volga).toMatchObject({ personalPriceMinor: 830_000 });
		expect(volga?.basePriceMinor).toBe(variant('MDL-201-180-PIN').basePriceMinor);
		expect(lada?.personalPriceMinor).toBeNull();
		expect(rows.filter((row) => row.productId === volga?.productId)).toHaveLength(1);
	});

	it('refuses a removed model', () => {
		const cp = counterpartyOn('Удалённая модель', null);
		const lada = variant('MDL-103-180-BIR');
		db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, lada.productId)).run();
		try {
			expect(() =>
				service().save(cp, [{ productId: lada.productId, priceMinor: 1_000 * 100 }])
			).toThrow(ValidationError);
		} finally {
			db.update(products).set({ deletedAt: null }).where(eq(products.id, lada.productId)).run();
		}
	});

	it.each<RoleCode>(['driver', 'carpenter', 'painter', 'cp_admin', 'cp_employee'])(
		'refuses %s',
		(role) => {
			expect(
				() =>
					new CounterpartyPriceService(actorOf(role, managerId, role.startsWith('cp_') ? 1 : null))
			).toThrow(ForbiddenError);
		}
	);

	it('lets the owner set a price', () => {
		const ownerId = insertUser({
			email: 'owner@prices.example',
			role: 'owner',
			counterpartyId: null
		});
		const cp = counterpartyOn('От руководителя', null);
		const lada = variant('MDL-101-180-CHB');
		new CounterpartyPriceService(actorOf('owner', ownerId)).save(cp, [
			{ productId: lada.productId, priceMinor: 410_000 }
		]);
		expect(
			db
				.select()
				.from(priceListItems)
				.where(eq(priceListItems.priceListId, listOf(cp) ?? 0))
				.all()
		).toHaveLength(1);
	});
});
