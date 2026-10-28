import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { stockCostBackfill } from '../../scripts/admin/stock';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { StockItemService } from '../../src/lib/server/crm-stock/stock-item.service';
import { auditLog, productVariants, stockItems } from '../../src/lib/server/db/schema';
import { stockItemCreateSchema } from '../../src/lib/validation/crm-stock';
import { dictId, stockItemId } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, seedOrderingWorld } from './helpers/portal-requests';

const db = migratedDatabase();
seedOrderingWorld(db);
const ownerId = insertUser({ email: 'own@cost.example', role: 'owner', counterpartyId: null });
const managerId = insertUser({ email: 'mgr@cost.example', role: 'manager', counterpartyId: null });
const owner = crmActor('owner', ownerId);
const manager = crmActor('manager', managerId);
const PCS = dictId(db, 'unit', 'pcs');
const VOLGA = stockItemId(db, 'MDL-201-180-PIN');

const items = (ctx = owner) => new StockItemService(ctx);
const fields = { kind: 'product' as const, title: 'Гроб «Тест»', unitId: PCS, minThreshold: 0 };

function costOf(id: number): number | undefined {
	return db
		.select({ cost: stockItems.costPriceMinor })
		.from(stockItems)
		.where(eq(stockItems.id, id))
		.all()[0]?.cost;
}

function setCost(id: number, costPriceMinor: number): void {
	db.update(stockItems).set({ costPriceMinor }).where(eq(stockItems.id, id)).run();
}

beforeEach(() => setCost(VOLGA, 0));

describe('the cost of a stock item (v1.62)', () => {
	it('takes the cost in the item form and shows it to the owner and the administrator', () => {
		const id = items().create({ ...fields, code: `COST-${Date.now()}`, costPriceMinor: 512_000 });

		expect(costOf(id)).toBe(512_000);
		for (const ctx of [owner, manager]) {
			expect(items(ctx).card(id).costPriceMinor).toBe(512_000);
			const rows = items(ctx).list(normalizeListQuery({ perPage: 200 })).rows;
			expect(rows.find((row) => row.id === id)?.costPriceMinor).toBe(512_000);
		}
	});

	it('journals the old and the new cost', () => {
		const code = `COST-J-${Date.now()}`;
		const id = items().create({ ...fields, code, costPriceMinor: 100_000 });

		items().update(id, { ...fields, code, isActive: true, costPriceMinor: 120_000 });

		expect(costOf(id)).toBe(120_000);
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			action: 'stock.item.update',
			before: { costPriceMinor: 100_000 },
			after: { costPriceMinor: 120_000 }
		});
	});

	it('keeps the cost when a form leaves the field out', () => {
		const code = `COST-K-${Date.now()}`;
		const id = items().create({ ...fields, code, costPriceMinor: 70_000 });

		items().update(id, { ...fields, code, isActive: true });

		expect(costOf(id)).toBe(70_000);
	});

	it('keeps the cost out of every body the shop crew and the driver get', () => {
		setCost(VOLGA, 300_000);
		for (const role of ['carpenter', 'grinder', 'painter', 'upholsterer'] as const) {
			const crew = crmActor(role, managerId);
			expect(items(crew).card(VOLGA)).not.toHaveProperty('costPriceMinor');
			const rows = items(crew).list(normalizeListQuery({ perPage: 200 })).rows;
			expect(rows.every((row) => !('costPriceMinor' in row))).toBe(true);
		}
	});

	it('refuses a cost from a role that cannot see it', () => {
		const crew = crmActor('carpenter', managerId);
		expect(() =>
			items(crew).create({ ...fields, code: `COST-X-${Date.now()}`, costPriceMinor: 1_000 })
		).toThrow(ForbiddenError);
	});

	it('takes whole roubles, an empty field means not sent', () => {
		const parse = (costPriceMinor: string) =>
			stockItemCreateSchema.safeParse({
				kind: 'product',
				code: 'C',
				title: 'T',
				unitId: String(PCS),
				minThreshold: '0',
				costPriceMinor
			});
		expect(parse('512000').data?.costPriceMinor).toBe(512_000);
		expect(parse('').data?.costPriceMinor).toBeUndefined();
		expect(parse('512050').success).toBe(false);
		expect(parse('-100').success).toBe(false);
	});
});

describe('stock:cost-backfill moves the variant cost to its stock item', () => {
	it('copies a filled variant cost into an empty item and leaves a filled item alone', () => {
		const [variant] = db
			.select({ id: productVariants.id, stockItemId: productVariants.stockItemId })
			.from(productVariants)
			.where(eq(productVariants.stockItemId, VOLGA))
			.all();
		if (!variant) throw new Error('the seeded variant has no stock item');
		db.update(productVariants)
			.set({ costPriceMinor: 410_000 })
			.where(eq(productVariants.id, variant.id))
			.run();

		expect(stockCostBackfill(db).copied).toBeGreaterThanOrEqual(1);
		expect(costOf(VOLGA)).toBe(410_000);

		setCost(VOLGA, 450_000);
		stockCostBackfill(db);
		expect(costOf(VOLGA)).toBe(450_000);
	});
});
