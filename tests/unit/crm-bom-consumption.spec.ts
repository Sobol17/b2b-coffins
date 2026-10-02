import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { StockItemService } from '../../src/lib/server/crm-stock/stock-item.service';
import { StockMoveService } from '../../src/lib/server/crm-stock/stock-move.service';
import { auditLog, bomNorms, bomVersions, stockMoves } from '../../src/lib/server/db/schema';
import { movesOf, stockItemId, thresholdJobs } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	optionId,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';

const db = migratedDatabase();
seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@c9.example', role: 'manager', counterpartyId: null });
const manager = crmActor('manager', managerId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const LADA_180 = variantId(db, 'MDL-101-180-CHB');
const WALNUT = optionId(db, 'Орех');
const PINE = stockItemId(db, 'CMP-BOARD-PINE'); // threshold 40
const LACQUER = stockItemId(db, 'CMP-LACQUER');
const VOLGA_SHELF = stockItemId(db, 'MDL-201-180-PIN');

function version(isActive: boolean, norms: readonly [number, number, number][]): number {
	const taken = db.select().from(bomVersions).all().length;
	const [row] = db
		.insert(bomVersions)
		.values({ version: taken + 1, isActive })
		.returning({ id: bomVersions.id })
		.all();
	if (!row) throw new Error('failed to insert a norm version');
	for (const [variant, componentId, qtyPerUnitMilli] of norms) {
		db.insert(bomNorms)
			.values({ bomVersionId: row.id, variantId: variant, componentId, qtyPerUnitMilli })
			.run();
	}
	return row.id;
}

function produce(qty: number, variant = VOLGA_180, colour: number | null = WALNUT) {
	new ShopService(manager).produce({ variantId: variant, optionId: colour, qty });
}

const consumption = (itemId: number) =>
	movesOf(db, itemId).filter((move) => move.type === 'consumption');
const balance = (itemId: number) => new StockItemService(manager).card(itemId).balance;

beforeEach(() => {
	resetRequests(db);
	db.delete(bomVersions).run();
});

describe('a production mark writes the components off (C9 DoD)', () => {
	it('takes every norm of the variant from the active version in one go', () => {
		const active = version(true, [
			[VOLGA_180, PINE, 2000],
			[VOLGA_180, LACQUER, 500]
		]);

		produce(4);

		expect(consumption(PINE)).toEqual([
			expect.objectContaining({ qty: -8, consumedMilli: 8000, optionId: null, actorId: managerId })
		]);
		expect(consumption(LACQUER)).toEqual([
			expect.objectContaining({ qty: -2, consumedMilli: 2000, requestId: null })
		]);
		expect(balance(VOLGA_SHELF)).toBe(4);
		const [audit] = db.select().from(auditLog).where(eq(auditLog.action, 'stock.produce')).all();
		expect(audit?.after).toMatchObject({
			bomVersionId: active,
			consumed: [
				{ componentId: PINE, qty: -8, consumedMilli: 8000 },
				{ componentId: LACQUER, qty: -2, consumedMilli: 2000 }
			]
		});
	});

	it('carries the fraction of a unit to the next mark', () => {
		version(true, [[VOLGA_180, LACQUER, 350]]);

		produce(1);
		produce(1);
		expect(balance(LACQUER)).toBe(0);
		produce(1);

		expect(consumption(LACQUER).map((move) => [move.qty, move.consumedMilli])).toEqual([
			[0, 350],
			[0, 350],
			[-1, 350]
		]);
		expect(balance(LACQUER)).toBe(-1);
	});

	it('writes nothing off for a variant without a norm or without an active version', () => {
		version(false, [[VOLGA_180, PINE, 2000]]);
		version(true, [[LADA_180, PINE, 1000]]);

		produce(3);

		expect(consumption(PINE)).toEqual([]);
		expect(balance(VOLGA_SHELF)).toBe(3);
		const [audit] = db.select().from(auditLog).where(eq(auditLog.action, 'stock.produce')).all();
		expect(audit?.after).toMatchObject({ bomVersionId: null, consumed: [] });
	});

	it('does not block the mark when the shelf is short: the balance goes into the red', () => {
		version(true, [[VOLGA_180, PINE, 2000]]);

		produce(5);

		expect(balance(PINE)).toBe(-10);
		expect(new StockItemService(manager).card(PINE).isNegative).toBe(true);
	});

	it('queues the threshold check for a component left under its threshold', () => {
		version(true, [[VOLGA_180, PINE, 2000]]);

		produce(1);

		expect(thresholdJobs(db).map((job) => job.payload)).toContainEqual({ stockItemId: PINE });
	});

	it('shows the exact figure in the journal and offers no reversal', () => {
		version(true, [[VOLGA_180, LACQUER, 350]]);
		produce(1);

		const [row] = new StockMoveService(manager).journal(LACQUER, normalizeListQuery({})).rows;

		expect(row).toMatchObject({
			type: 'consumption',
			qty: 0,
			consumedMilli: 350,
			canReverse: false
		});
	});
});

describe('old consumption is not recalculated (C9 DoD)', () => {
	it('keeps the written moves when the norm changes and a new version takes over', () => {
		const first = version(true, [[VOLGA_180, PINE, 2000]]);
		produce(2);
		const before = consumption(PINE);

		db.update(bomNorms)
			.set({ qtyPerUnitMilli: 9000 })
			.where(eq(bomNorms.bomVersionId, first))
			.run();
		db.update(bomVersions).set({ isActive: false }).where(eq(bomVersions.id, first)).run();
		version(true, [[VOLGA_180, PINE, 3000]]);
		produce(1);

		expect(consumption(PINE).slice(0, before.length)).toEqual(before);
		expect(consumption(PINE).map((move) => move.qty)).toEqual([-4, -3]);
	});

	it('rolls the components back together with a refused mark', () => {
		version(true, [[VOLGA_180, PINE, 2000]]);
		const foreignColour = optionId(db, 'Белый') + 10_000;

		expect(() => produce(1, VOLGA_180, foreignColour)).toThrow();

		expect(db.select().from(stockMoves).all()).toEqual([]);
	});
});
