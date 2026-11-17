import ExcelJS from 'exceljs';
import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { StockFilters } from '../../src/lib/types/crm-stock';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { CrmCatalogService } from '../../src/lib/server/crm-catalog/crm-catalog.service';
import { StockItemService } from '../../src/lib/server/crm-stock/stock-item.service';
import { InventoryService } from '../../src/lib/server/crm-stock/inventory.service';
import { StockExportService } from '../../src/lib/server/crm-stock/stock-export.service';
import { StockMoveService } from '../../src/lib/server/crm-stock/stock-move.service';
import { productVariants, stockItems, stockMoves } from '../../src/lib/server/db/schema';
import { dictId, stockItemId } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, seedOrderingWorld } from './helpers/portal-requests';

const db = migratedDatabase();
seedOrderingWorld(db);
const actor = crmActor(
	'manager',
	insertUser({ email: 'stock-registry@example.test', role: 'manager', counterpartyId: null })
);
const service = new StockItemService(actor);
const pcs = dictId(db, 'unit', 'pcs');
const query = normalizeListQuery<StockFilters>({ perPage: 200 });

function create(code: string) {
	return service.create({ kind: 'component', code, title: code, unitId: pcs, minThreshold: 0 });
}

describe('model stock registry', () => {
	it('groups every size before paging and keeps all positions when a variant matches search', () => {
		const itemId = stockItemId(db, 'MDL-201-180-PIN');
		const [variant] = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.stockItemId, itemId))
			.all();
		expect(variant).toBeDefined();
		const linkedIds = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.productId, variant!.productId))
			.all()
			.map((v) => v.stockItemId);
		const page = service.list({ ...query, search: 'MDL-201-180-PIN', perPage: 1 });
		expect(page.total).toBe(1);
		expect(page.rows[0]?.members.map((member) => member.id).sort()).toEqual(
			[...new Set(linkedIds)].sort()
		);
		expect(service.exportRows({ ...query, search: 'MDL-201-180-PIN' })).toHaveLength(1);
	});
	it('pages whole models and exports the same summaries', async () => {
		const all = service.list(query);
		const first = service.list({ ...query, perPage: 1 });
		const second = service.list({ ...query, perPage: 1, page: 2 });
		expect(first.total).toBe(all.total);
		expect(first.rows[0]).toEqual(all.rows[0]);
		expect(second.rows[0]).toEqual(all.rows[1]);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(
			new Uint8Array(await new StockExportService(actor).registry(query)).buffer
		);
		expect(workbook.worksheets[0]?.rowCount).toBe(all.total + 1);
	});

	it('exposes differing costs as a range only to permitted roles', () => {
		const id = stockItemId(db, 'MDL-201-180-PIN');
		const members = service.list({ ...query, search: 'MDL-201-180-PIN' }).rows[0]!.members;
		db.update(stockItems)
			.set({ costPriceMinor: 60000 })
			.where(
				inArray(
					stockItems.id,
					members.map((member) => member.id)
				)
			)
			.run();
		db.update(stockItems).set({ costPriceMinor: 50000 }).where(eq(stockItems.id, id)).run();
		const summary = service.list({ ...query, search: 'MDL-201-180-PIN' }).rows[0];
		expect(summary?.costRange).toEqual([50000, 60000]);
		expect(summary?.members.find((member) => member.id === id)?.costPriceMinor).toBe(50000);
		const reader = new StockItemService(crmActor('carpenter', actor.userId));
		const body = JSON.stringify(reader.list(query));
		expect(body).not.toContain('costPriceMinor');
		expect(body).not.toContain('costRange');
	});

	it('retains a negative colour warning even when the model total is positive', () => {
		const itemId = stockItemId(db, 'MDL-201-180-PIN');
		db.insert(stockMoves)
			.values([
				{ stockItemId: itemId, qty: 5, type: 'purchase', occurredAt: new Date() },
				{ stockItemId: itemId, optionId: 1, qty: -2, type: 'adjustment', occurredAt: new Date() }
			])
			.run();
		const page = service.list({ ...query, search: 'MDL-201-180-PIN', filters: { negative: true } });
		expect(page.rows[0]).toMatchObject({ balance: 3, isNegative: true });
	});
});

describe('stock archive', () => {
	it('hides an archived zero-balance item, keeps its history and refuses further writes', () => {
		const id = create('ARCHIVE-EMPTY');
		db.insert(stockMoves)
			.values([
				{ stockItemId: id, qty: 1, type: 'purchase', occurredAt: new Date() },
				{ stockItemId: id, qty: -1, type: 'adjustment', occurredAt: new Date() }
			])
			.run();
		service.archive(id);
		expect(service.list({ ...query, search: 'ARCHIVE-EMPTY' }).total).toBe(0);
		expect(service.card(id)).toMatchObject({ isDeleted: true, canManage: false, balance: 0 });
		expect(db.select().from(stockMoves).where(eq(stockMoves.stockItemId, id)).all()).toHaveLength(
			2
		);
		expect(() =>
			new StockMoveService(actor).create(id, {
				type: 'purchase',
				qty: 1,
				optionId: null,
				reasonId: null,
				comment: null
			})
		).toThrow(ConflictError);
		expect(() =>
			service.update(id, {
				code: 'ARCHIVE-EMPTY',
				title: 'Changed',
				unitId: pcs,
				minThreshold: 0,
				isActive: true
			})
		).toThrow(ConflictError);
		expect(
			db.select().from(stockItems).where(eq(stockItems.id, id)).get()?.deletedAt
		).toBeInstanceOf(Date);
	});
	it('refuses nonzero balances without deleting any movement', () => {
		const id = create('ARCHIVE-NONZERO');
		db.insert(stockMoves)
			.values({ stockItemId: id, qty: 1, type: 'purchase', occurredAt: new Date() })
			.run();
		expect(() => service.archive(id)).toThrow(ConflictError);
		expect(service.card(id).isActive).toBe(true);
	});
	it('refuses cancelling colour balances even when their total is zero', () => {
		const id = create('ARCHIVE-COLOURS');
		db.insert(stockMoves)
			.values([
				{ stockItemId: id, optionId: 1, qty: 2, type: 'purchase', occurredAt: new Date() },
				{ stockItemId: id, qty: -2, type: 'adjustment', occurredAt: new Date() }
			])
			.run();
		expect(service.card(id).balance).toBe(0);
		expect(() => service.archive(id)).toThrow(ConflictError);
	});

	it('keeps archived items out of new inventories and protects existing drafts', () => {
		const archivedId = create('ARCHIVE-INVENTORY');
		service.archive(archivedId);
		const activeId = create('ARCHIVE-DRAFT');
		const inventories = new InventoryService(actor);
		const draftId = inventories.create({ kind: 'component', comment: null });
		const lines = inventories.card(draftId).lines;
		expect(lines.some((line) => line.stockItemId === archivedId)).toBe(false);
		expect(lines.some((line) => line.stockItemId === activeId)).toBe(true);
		expect(() => service.archive(activeId)).toThrow(ConflictError);
		inventories.remove(draftId);
		service.archive(activeId);
		expect(service.card(activeId).isDeleted).toBe(true);
	});

	it('does not re-enable an option whose linked component was archived', () => {
		const id = create('ARCHIVE-INACTIVE-OPTION');
		const catalog = new CrmCatalogService(actor);
		const option = catalog.createOption({
			title: 'Archived component option',
			priceDeltaMinor: 0,
			stockItemId: id,
			isActive: false
		});
		service.archive(id);
		expect(() => catalog.setOptionActive(option.id, true)).toThrow(ValidationError);
		expect(catalog.listOptions().find((row) => row.id === option.id)?.isActive).toBe(false);
	});

	it('refuses linked catalog variants and unauthorized actors', () => {
		const id = stockItemId(db, 'MDL-201-200-PIN');
		expect(() => service.archive(id)).toThrow(ConflictError);
		expect(() => new StockItemService(crmActor('carpenter', actor.userId)).archive(id)).toThrow(
			ForbiddenError
		);
	});
});
