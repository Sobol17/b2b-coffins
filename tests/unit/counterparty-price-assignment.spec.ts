import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { actions } from '../../src/routes/(crm)/crm/counterparties/[id]/+page.server';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { CrmCounterpartyService } from '../../src/lib/server/crm-counterparty/crm-counterparty.service';
import { CrmCounterpartyRepository } from '../../src/lib/server/crm-counterparty/crm-counterparty.repository';
import { CounterpartyPriceService } from '../../src/lib/server/crm-counterparty/counterparty-price.service';
import { PersonalListFiller } from '../../src/lib/server/crm-counterparty/personal-list';
import {
	auditLog,
	counterparties,
	priceListItems,
	priceLists,
	products
} from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import { actorOf, counterpartyDatabase } from './helpers/crm-counterparty';
import { insertCounterparty, insertUser } from './helpers/db';

const db = counterpartyDatabase();
const managerId = insertUser({
	email: 'assign@workshop.example',
	role: 'manager',
	counterpartyId: null
});
const manager = actorOf('manager', managerId);
const blind = {
	...manager,
	roles: ['manager', 'driver'],
	canSeePrices: false
} satisfies ActorContext;
const product = db
	.insert(products)
	.values({ sku: 'ASSIGN-MODEL', title: 'Модель' })
	.returning()
	.get()!;
let sequence = 0;
let counterpartyId = 0;

function region(priceMinor = 123_000, flags: { isBase?: boolean; isPersonal?: boolean } = {}) {
	const list = db
		.insert(priceLists)
		.values({ title: `Регион ${++sequence}`, ...flags })
		.returning()
		.get()!;
	db.insert(priceListItems)
		.values({ priceListId: list.id, productId: product.id, priceMinor })
		.run();
	return list.id;
}
const current = () =>
	db.select().from(counterparties).where(eq(counterparties.id, counterpartyId)).get()!;
const service = (actor: ActorContext = manager) => new CrmCounterpartyService(actor);
const assignedPrice = () =>
	db
		.select()
		.from(priceListItems)
		.where(eq(priceListItems.priceListId, current().priceListId!))
		.get()?.priceMinor;
const journal = () =>
	db.select().from(auditLog).where(eq(auditLog.action, 'counterparty.terms_update')).all();

beforeEach(() => {
	counterpartyId = insertCounterparty(`Контрагент ${++sequence}`);
	db.update(counterparties)
		.set({ managerId, discountPercent: 17, settlementScheme: 'monthly', staffLimit: 23 })
		.where(eq(counterparties.id, counterpartyId))
		.run();
	db.delete(auditLog).run();
});

function event(fields: Record<string, string>, actor: ActorContext = manager) {
	return {
		locals: { actor },
		params: { id: String(counterpartyId) },
		url: new URL(`http://localhost/crm/counterparties/${counterpartyId}?/priceList`),
		request: new Request(`http://localhost/crm/counterparties/${counterpartyId}?/priceList`, {
			method: 'POST',
			body: new URLSearchParams(fields)
		})
	} as Parameters<typeof actions.terms>[0];
}

describe('assigning only the regional price list', () => {
	it('preserves unrelated terms, fills a missing personal list and journals only the region', () => {
		const before = current();
		const regionId = region();
		const card = service().assignPriceList(counterpartyId, regionId);
		expect(card.regionPriceListId).toBe(regionId);
		expect(current()).toMatchObject({
			managerId: before.managerId,
			discountPercent: 17,
			settlementScheme: 'monthly',
			staffLimit: 23,
			regionPriceListId: regionId
		});
		expect(assignedPrice()).toBe(123_000);
		expect(journal()).toHaveLength(1);
		expect(journal()[0]?.before).toEqual({ regionPriceListId: null });
		expect(journal()[0]?.after).toEqual({ regionPriceListId: regionId });
		expect(journal()[0]).toMatchObject({
			entityId: counterpartyId,
			before: { regionPriceListId: null },
			after: { regionPriceListId: regionId }
		});
	});
	it('keeps existing personal prices when switching regions until a separate refill', () => {
		service().assignPriceList(counterpartyId, region(111_000));
		const own = current().priceListId;
		const next = region(222_000);
		service().assignPriceList(counterpartyId, next);
		expect(current().priceListId).toBe(own);
		expect(assignedPrice()).toBe(111_000);
		new CounterpartyPriceService(manager).refill(counterpartyId);
		expect(assignedPrice()).toBe(222_000);
	});
	it('clears the binding without removing the personal list or changing other terms', () => {
		const oldRegion = region();
		service().assignPriceList(counterpartyId, oldRegion);
		const own = current().priceListId;
		service().assignPriceList(counterpartyId, null);
		expect(current()).toMatchObject({
			regionPriceListId: null,
			priceListId: own,
			managerId,
			discountPercent: 17,
			settlementScheme: 'monthly',
			staffLimit: 23
		});
		expect(journal().at(-1)).toMatchObject({
			before: { regionPriceListId: oldRegion },
			after: { regionPriceListId: null }
		});
	});
	it.each([{ isBase: true }, { isPersonal: true }])(
		'rejects a nonregional list %j without mutation or audit',
		(flags) => {
			const before = current();
			expect(() => service().assignPriceList(counterpartyId, region(123_000, flags))).toThrow(
				ValidationError
			);
			expect(current()).toEqual(before);
			expect(journal()).toHaveLength(0);
		}
	);
	it('rejects an unknown list and an unknown counterparty', () => {
		expect(() => service().assignPriceList(counterpartyId, 999_999)).toThrow(ValidationError);
		expect(() => service().assignPriceList(999_999, null)).toThrow(NotFoundError);
		expect(journal()).toHaveLength(0);
	});
	it('requires counterparty management and price visibility independently', () => {
		expect(() =>
			service(actorOf('carpenter', managerId)).assignPriceList(counterpartyId, null)
		).toThrow(ForbiddenError);
		expect(() => service(blind).assignPriceList(counterpartyId, null)).toThrow(ForbiddenError);
		expect(journal()).toHaveLength(0);
	});
	it('rolls the region and audit back if filling the personal list fails', () => {
		class BrokenFiller extends PersonalListFiller {
			override fill(): never {
				throw new Error('fixture fill failure');
			}
		}
		const cards = new CrmCounterpartyService(
			manager,
			new CrmCounterpartyRepository(),
			undefined,
			undefined,
			undefined,
			new BrokenFiller()
		);
		expect(() => cards.assignPriceList(counterpartyId, region())).toThrow('fixture fill failure');
		expect(current().regionPriceListId).toBeNull();
		expect(journal()).toHaveLength(0);
	});
	it('audits repeated assignment like terms saving but does not fill it again', () => {
		const id = region();
		db.update(counterparties)
			.set({ regionPriceListId: id })
			.where(eq(counterparties.id, counterpartyId))
			.run();
		service().assignPriceList(counterpartyId, id);
		expect(current().priceListId).toBeNull();
		expect(journal()).toHaveLength(1);
		expect(journal()[0]).toMatchObject({
			before: { regionPriceListId: id },
			after: { regionPriceListId: id }
		});
	});
});

describe('the separate priceList form action', () => {
	it('uses only the regional id and ignores forged hidden commercial terms', async () => {
		const regionId = region();
		const result = await actions.priceList(
			event({
				regionPriceListId: String(regionId),
				discountPercent: '99',
				staffLimit: '999',
				settlementScheme: 'on_fact',
				managerId: ''
			})
		);
		expect(result).toMatchObject({ action: 'priceList', result: { regionPriceListId: regionId } });
		expect(current()).toMatchObject({
			managerId,
			discountPercent: 17,
			staffLimit: 23,
			settlementScheme: 'monthly'
		});
	});
	it('accepts an empty regional id to remove the binding', async () => {
		service().assignPriceList(counterpartyId, region());
		expect(await actions.priceList(event({ regionPriceListId: '' }))).toMatchObject({
			action: 'priceList',
			result: { regionPriceListId: null }
		});
	});
	it('returns a scoped form error for a malformed id and preserves the terms', async () => {
		expect(await actions.priceList(event({ regionPriceListId: '-1' }))).toMatchObject({
			status: 422,
			data: { action: 'priceList', formError: expect.any(String) }
		});
		expect(current().regionPriceListId).toBeNull();
		expect(journal()).toHaveLength(0);
	});
	it('checks price visibility before parsing the posted fields', async () => {
		const denied = event({}, blind);
		denied.request = new Request(denied.url, {
			method: 'POST',
			body: '{}',
			headers: { 'content-type': 'application/json' }
		});
		await expect(async () => actions.priceList(denied)).rejects.toMatchObject({ status: 403 });
		expect(journal()).toHaveLength(0);
	});
});
