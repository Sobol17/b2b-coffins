import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { InventoryService } from '../../src/lib/server/crm-stock/inventory.service';
import { StockItemService } from '../../src/lib/server/crm-stock/stock-item.service';
import { StockMoveService } from '../../src/lib/server/crm-stock/stock-move.service';
import { auditLog, inventoryLines } from '../../src/lib/server/db/schema';
import { inventorySaveSchema } from '../../src/lib/validation/crm-stock';
import { movesOf, resetInventories, stockItemId } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, optionId, resetRequests, seedOrderingWorld } from './helpers/portal-requests';

const db = migratedDatabase();
seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@inv.example', role: 'manager', counterpartyId: null });
const manager = crmActor('manager', managerId);

const PINE = stockItemId(db, 'CMP-BOARD-PINE');
const OAK = stockItemId(db, 'CMP-BOARD-OAK');
const VOLGA = stockItemId(db, 'MDL-201-180-PIN');
const WALNUT = optionId(db, 'Орех');
const WHITE = optionId(db, 'Белый');

const inventory = (ctx = manager) => new InventoryService(ctx);
const balanceOf = (itemId: number) => new StockItemService(manager).card(itemId).balance;

function purchase(itemId: number, qty: number, colour: number | null = null) {
	new StockMoveService(manager).create(itemId, {
		type: 'purchase',
		optionId: colour,
		qty,
		reasonId: null,
		comment: null
	});
}

function lineOf(id: number, itemId: number, colour: number | null = null) {
	const line = inventory()
		.card(id)
		.lines.find((row) => row.stockItemId === itemId && row.optionId === colour);
	if (!line) throw new Error('the inventory has no such line');
	return line;
}

/** The counted figures of the form: every other line keeps what the draft holds. */
function counted(
	id: number,
	facts: readonly [itemId: number, colour: number | null, qty: number][]
) {
	return {
		comment: null,
		lines: facts.map(([itemId, colour, qty]) => ({
			lineId: lineOf(id, itemId, colour).id,
			actualQty: qty
		}))
	};
}

const inventoryMoves = (itemId: number) =>
	movesOf(db, itemId).filter((move) => move.type === 'inventory');

beforeEach(() => {
	resetInventories(db);
	resetRequests(db);
});

describe('a draft of an inventory (tech.md v1.45)', () => {
	it('lists every active component with the balance on the books', () => {
		purchase(PINE, 30);

		const id = inventory().create({ kind: 'component', comment: 'конец месяца' });

		const card = inventory().card(id);
		expect(card).toMatchObject({ kind: 'component', status: 'draft', diffCount: 0 });
		expect(card.lines.length).toBeGreaterThan(1);
		expect(lineOf(id, PINE)).toMatchObject({ expectedQty: 30, actualQty: 30, colorTitle: null });
		expect(lineOf(id, OAK)).toMatchObject({ expectedQty: 0, actualQty: 0 });
	});

	it('lists a product by the colours that have moved', () => {
		purchase(VOLGA, 4, WALNUT);
		purchase(VOLGA, 2, WHITE);

		const id = inventory().create({ kind: 'product', comment: null });

		const lines = inventory().card(id).lines;
		expect(lines.map((line) => [line.colorTitle, line.expectedQty]).sort()).toEqual([
			['Белый', 2],
			['Орех', 4]
		]);
	});

	it('refuses a second open draft of the kind and allows one of the other kind', () => {
		purchase(VOLGA, 1, WALNUT);
		inventory().create({ kind: 'component', comment: null });

		expect(() => inventory().create({ kind: 'component', comment: null })).toThrow(ConflictError);
		expect(() => inventory().create({ kind: 'product', comment: null })).not.toThrow();
	});

	it('refuses a kind with nothing to count', () => {
		expect(() => inventory().create({ kind: 'product', comment: null })).toThrow(ValidationError);
	});

	it('saves the counted figures without touching the journal', () => {
		purchase(PINE, 30);
		const id = inventory().create({ kind: 'component', comment: null });

		inventory().save(id, { ...counted(id, [[PINE, null, 27]]), comment: 'три доски в браке нет' });

		expect(lineOf(id, PINE)).toMatchObject({ expectedQty: 30, actualQty: 27 });
		expect(inventory().card(id)).toMatchObject({ status: 'draft', diffCount: 1 });
		expect(inventory().list(normalizeListQuery({})).rows[0]).toMatchObject({ id, diffCount: 1 });
		expect(balanceOf(PINE)).toBe(30);
		expect(inventoryMoves(PINE)).toEqual([]);
	});

	it('is deleted with its lines and leaves no move', () => {
		purchase(PINE, 30);
		const id = inventory().create({ kind: 'component', comment: null });

		inventory().remove(id);

		expect(() => inventory().card(id)).toThrow(NotFoundError);
		expect(db.select().from(inventoryLines).all()).toEqual([]);
		expect(movesOf(db, PINE)).toHaveLength(1);
	});
});

describe('applying an inventory in one operation (C8 DoD)', () => {
	it('brings every counted line to the fact with one move per line that differs', () => {
		purchase(PINE, 30);
		purchase(OAK, 10);
		const id = inventory().create({ kind: 'component', comment: null });

		inventory().apply(
			id,
			counted(id, [
				[PINE, null, 27],
				[OAK, null, 10]
			])
		);

		expect(balanceOf(PINE)).toBe(27);
		expect(balanceOf(OAK)).toBe(10);
		expect(inventoryMoves(PINE).map((move) => move.qty)).toEqual([-3]);
		expect(inventoryMoves(OAK)).toEqual([]);
		const card = inventory().card(id);
		expect(card).toMatchObject({ status: 'applied', diffCount: 1 });
		expect(card.appliedAt).not.toBeNull();
	});

	it('counts a product by colour', () => {
		purchase(VOLGA, 4, WALNUT);
		purchase(VOLGA, 2, WHITE);
		const id = inventory().create({ kind: 'product', comment: null });

		inventory().apply(id, counted(id, [[VOLGA, WHITE, 5]]));

		expect(inventoryMoves(VOLGA)).toHaveLength(1);
		expect(inventoryMoves(VOLGA)[0]).toMatchObject({ qty: 3, optionId: WHITE });
		expect(balanceOf(VOLGA)).toBe(9);
	});

	it('reads the books again: a move made after the draft was saved is not counted twice', () => {
		purchase(PINE, 30);
		const id = inventory().create({ kind: 'component', comment: null });
		inventory().save(id, counted(id, [[PINE, null, 27]]));
		purchase(PINE, 5);

		expect(lineOf(id, PINE)).toMatchObject({ expectedQty: 35, actualQty: 27 });
		inventory().apply(id, { comment: null, lines: [] });

		expect(balanceOf(PINE)).toBe(27);
		expect(inventoryMoves(PINE).map((move) => move.qty)).toEqual([-8]);
		expect(lineOf(id, PINE)).toMatchObject({ expectedQty: 35, actualQty: 27 });
	});

	it('writes one audit row and nothing at all when a line is foreign', () => {
		purchase(PINE, 30);
		const id = inventory().create({ kind: 'component', comment: null });
		const foreign = { comment: null, lines: [{ lineId: 999_999, actualQty: 1 }] };

		expect(() => inventory().apply(id, foreign)).toThrow(ValidationError);
		expect(inventory().card(id).status).toBe('draft');
		expect(inventoryMoves(PINE)).toEqual([]);

		inventory().apply(id, counted(id, [[PINE, null, 29]]));
		const rows = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'stock.inventory.apply'))
			.all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ entity: 'inventories', entityId: id });
	});

	it('is a record once applied: no second apply, no save, no delete', () => {
		purchase(PINE, 30);
		const id = inventory().create({ kind: 'component', comment: null });
		inventory().apply(id, counted(id, [[PINE, null, 27]]));
		const again = { comment: null, lines: [] };

		expect(() => inventory().apply(id, again)).toThrow(ConflictError);
		expect(() => inventory().save(id, again)).toThrow(ConflictError);
		expect(() => inventory().remove(id)).toThrow(ConflictError);
		expect(inventoryMoves(PINE)).toHaveLength(1);
		// The kind is free again once its draft is applied.
		expect(() => inventory().create({ kind: 'component', comment: null })).not.toThrow();
	});
});

describe('rights and the form of an inventory', () => {
	it('refuses the driver the section and a reader every write', () => {
		purchase(PINE, 30);
		const id = inventory().create({ kind: 'component', comment: null });
		const reader = inventory(crmActor('carpenter', managerId));
		const nothing = { comment: null, lines: [] };

		expect(() => inventory(crmActor('driver', managerId))).toThrow(ForbiddenError);
		expect(reader.card(id).canManage).toBe(false);
		expect(() => reader.create({ kind: 'product', comment: null })).toThrow(ForbiddenError);
		expect(() => reader.save(id, nothing)).toThrow(ForbiddenError);
		expect(() => reader.apply(id, nothing)).toThrow(ForbiddenError);
		expect(() => reader.remove(id)).toThrow(ForbiddenError);
	});

	it('reads one field per line from the form and refuses a negative or fractional fact', () => {
		const parsed = inventorySaveSchema.safeParse({
			comment: ' ',
			'actual.7': '12',
			'actual.9': '0'
		});
		expect(parsed.success && parsed.data).toEqual({
			comment: null,
			lines: [
				{ lineId: 7, actualQty: 12 },
				{ lineId: 9, actualQty: 0 }
			]
		});
		expect(inventorySaveSchema.safeParse({ 'actual.7': '-1' }).success).toBe(false);
		expect(inventorySaveSchema.safeParse({ 'actual.7': '1.5' }).success).toBe(false);
		expect(inventorySaveSchema.safeParse({ 'actual.7': '' }).success).toBe(false);
	});
});
