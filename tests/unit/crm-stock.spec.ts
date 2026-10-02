import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { StockItemService } from '../../src/lib/server/crm-stock/stock-item.service';
import { StockMoveService } from '../../src/lib/server/crm-stock/stock-move.service';
import { auditLog } from '../../src/lib/server/db/schema';
import type { StockFilters } from '../../src/lib/types/crm-stock';
import type { RoleCode } from '../../src/lib/types/roles';
import {
	stockFiltersSchema,
	stockItemCreateSchema,
	stockMoveSchema
} from '../../src/lib/validation/crm-stock';
import { dictId, movesOf, stockItemId } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	optionId,
	portalActor,
	resetRequests,
	seedOrderingWorld
} from './helpers/portal-requests';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@c8.example', role: 'manager', counterpartyId: null });
const manager = crmActor('manager', managerId);
const carpenter = crmActor('carpenter', managerId);

const PINE = stockItemId(db, 'CMP-BOARD-PINE'); // threshold 40
const VOLGA = stockItemId(db, 'MDL-201-180-PIN');
const WALNUT = optionId(db, 'Орех');
const WHITE = optionId(db, 'Белый');
const CORRECTION = dictId(db, 'stock_move_reason', 'correction');
const PCS = dictId(db, 'unit', 'pcs');

const items = (ctx = manager) => new StockItemService(ctx);
const moves = (ctx = manager) => new StockMoveService(ctx);
const list = (filters: StockFilters = {}, search?: string) =>
	items().list(normalizeListQuery({ perPage: 200, filters, ...(search ? { search } : {}) }));
const journal = (itemId: number) => moves().journal(itemId, normalizeListQuery({})).rows;

function purchase(itemId: number, qty: number, colour: number | null = null) {
	return moves().create(itemId, {
		type: 'purchase',
		optionId: colour,
		qty,
		reasonId: null,
		comment: null
	});
}

function adjust(itemId: number, qty: number, colour: number | null = null) {
	return moves().create(itemId, {
		type: 'adjustment',
		optionId: colour,
		qty,
		reasonId: CORRECTION,
		comment: 'пересчёт'
	});
}

const audit = (action: string) =>
	db.select().from(auditLog).where(eq(auditLog.action, action)).all();

beforeEach(() => resetRequests(db));

describe('rights on the warehouse (C8)', () => {
	it('opens the registry to the manager and refuses the driver and the portal with 403', () => {
		expect(list().total).toBeGreaterThan(0);
		const strangers: RoleCode[] = ['driver'];
		for (const role of strangers) {
			expect(() => items(crmActor(role, managerId))).toThrow(ForbiddenError);
			expect(() => moves(crmActor(role, managerId))).toThrow(ForbiddenError);
		}
		expect(() => items(portalActor('cp_admin', world.adminId, world.cpId))).toThrow(ForbiddenError);
	});

	it('lets a reader look and refuses every write without stock.manage', () => {
		purchase(PINE, 5);
		expect(items(carpenter).card(PINE).canManage).toBe(false);
		expect(moves(carpenter).journal(PINE, normalizeListQuery({})).rows[0]?.canReverse).toBe(false);

		const move = {
			type: 'purchase',
			optionId: null,
			qty: 1,
			reasonId: null,
			comment: null
		} as const;
		expect(() => moves(carpenter).create(PINE, move)).toThrow(ForbiddenError);
		expect(() => moves(carpenter).reverse(PINE, 1)).toThrow(ForbiddenError);
		expect(() =>
			items(carpenter).create({
				kind: 'component',
				code: 'X',
				title: 'X',
				unitId: PCS,
				minThreshold: 0
			})
		).toThrow(ForbiddenError);
		expect(movesOf(db, PINE)).toHaveLength(1);
	});
});

describe('balance equals the sum of moves (C8 DoD)', () => {
	it('shows in the registry and on the card what the journal adds up to', () => {
		purchase(PINE, 50);
		adjust(PINE, -8);
		purchase(PINE, 3);

		const row = list({}, 'CMP-BOARD-PINE').rows[0];
		expect(row?.balance).toBe(45);
		expect(items().card(PINE).balance).toBe(45);
		expect(journal(PINE).reduce((sum, move) => sum + move.qty, 0)).toBe(45);
	});

	it('opens the figure of a product into its colours and their moves', () => {
		purchase(VOLGA, 4, WALNUT);
		purchase(VOLGA, 2, WHITE);
		adjust(VOLGA, -1, WHITE);

		const card = items().card(VOLGA);
		expect(card.balance).toBe(5);
		expect(card.positions.map((row) => [row.colorTitle, row.balance]).sort()).toEqual([
			['Белый', 1],
			['Орех', 4]
		]);
		expect(card.colors.map((colour) => colour.id)).toEqual(expect.arrayContaining([WALNUT, WHITE]));
		expect(journal(VOLGA).map((move) => move.qty)).toEqual([-1, 2, 4]);
	});

	it('names the type, the reason, the comment and the author of every move', () => {
		adjust(PINE, -2);
		expect(journal(PINE)[0]).toMatchObject({
			type: 'adjustment',
			qty: -2,
			reasonTitle: 'Корректировка учёта',
			comment: 'пересчёт',
			actorName: 'Тестовый пользователь',
			requestNumber: null,
			isReversed: false,
			canReverse: true
		});
	});
});

describe('manual moves (tech.md v1.45)', () => {
	it('writes the audit row of a move', () => {
		const id = purchase(PINE, 5);
		expect(audit('stock.move.create')).toHaveLength(1);
		expect(audit('stock.move.create')[0]).toMatchObject({ entity: 'stock_moves', entityId: id });
	});

	it('refuses a zero move, a purchase with a minus and an adjustment without a reason', () => {
		expect(() => purchase(PINE, 0)).toThrow(ValidationError);
		expect(() => purchase(PINE, -3)).toThrow(ValidationError);
		expect(() =>
			moves().create(PINE, {
				type: 'adjustment',
				optionId: null,
				qty: 3,
				reasonId: null,
				comment: null
			})
		).toThrow(ValidationError);
		expect(movesOf(db, PINE)).toEqual([]);
	});

	it('refuses a reason from another dictionary', () => {
		expect(() =>
			moves().create(PINE, {
				type: 'adjustment',
				optionId: null,
				qty: 3,
				reasonId: PCS,
				comment: null
			})
		).toThrow(ValidationError);
	});

	it('refuses a colour on a component and a colour outside the matrix of a product', () => {
		expect(() => purchase(PINE, 1, WALNUT)).toThrow(ValidationError);
		expect(() => purchase(VOLGA, 1, 999_999)).toThrow(ValidationError);
		expect(movesOf(db, VOLGA)).toEqual([]);
	});

	it('refuses a move on a switched-off item and on an unknown one', () => {
		const id = items().create({
			kind: 'component',
			code: 'CMP-OFF',
			title: 'Выключенная',
			unitId: PCS,
			minThreshold: 0
		});
		items().update(id, {
			code: 'CMP-OFF',
			title: 'Выключенная',
			unitId: PCS,
			minThreshold: 0,
			isActive: false
		});
		expect(() => purchase(id, 1)).toThrow(ConflictError);
		expect(() => purchase(999_999, 1)).toThrow(NotFoundError);
	});

	it('takes the quantity limits and the signed number from the form', () => {
		const ok = stockMoveSchema.safeParse({
			type: 'adjustment',
			qty: '-7',
			optionId: '',
			reasonId: '3'
		});
		expect(ok.success && ok.data).toMatchObject({
			qty: -7,
			optionId: null,
			reasonId: 3,
			comment: null
		});
		expect(stockMoveSchema.safeParse({ type: 'purchase', qty: '1.5' }).success).toBe(false);
		expect(stockMoveSchema.safeParse({ type: 'purchase', qty: '100001' }).success).toBe(false);
		expect(stockMoveSchema.safeParse({ type: 'production', qty: '1' }).success).toBe(false);
	});
});

describe('reversal instead of deletion (tech.md 6.3)', () => {
	it('returns the balance and keeps both rows in the journal', () => {
		purchase(PINE, 10);
		const wrong = adjust(PINE, -4);

		const undo = moves().reverse(PINE, wrong);

		expect(items().card(PINE).balance).toBe(10);
		const rows = journal(PINE);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({ id: undo, type: 'reversal', qty: 4, reversalOfId: wrong });
		expect(rows[1]).toMatchObject({ id: wrong, isReversed: true, canReverse: false });
		expect(audit('stock.move.reverse')).toHaveLength(1);
	});

	it('refuses a second reversal and a reversal of a reversal', () => {
		const wrong = purchase(PINE, 10);
		const undo = moves().reverse(PINE, wrong);

		expect(() => moves().reverse(PINE, wrong)).toThrow(ConflictError);
		expect(() => moves().reverse(PINE, undo)).toThrow(ConflictError);
		expect(movesOf(db, PINE)).toHaveLength(2);
	});

	it('refuses a move of another item', () => {
		const wrong = purchase(PINE, 10);
		expect(() => moves().reverse(VOLGA, wrong)).toThrow(NotFoundError);
	});
});

describe('the registry: thresholds and the red', () => {
	it('flags an item under its threshold and finds it by the filter', () => {
		purchase(PINE, 39);
		expect(list({}, 'CMP-BOARD-PINE').rows[0]).toMatchObject({ isBelowThreshold: true });
		expect(list({ belowThreshold: true }).rows.map((row) => row.id)).toContain(PINE);

		purchase(PINE, 1);
		expect(list({}, 'CMP-BOARD-PINE').rows[0]).toMatchObject({ isBelowThreshold: false });
		expect(list({ belowThreshold: true }).rows.map((row) => row.id)).not.toContain(PINE);
	});

	it('flags a colour in the red even when the item sums above zero', () => {
		purchase(VOLGA, 5, WALNUT);
		adjust(VOLGA, -2, WHITE);

		expect(items().card(VOLGA)).toMatchObject({ balance: 3, isNegative: true });
		expect(list({ negative: true }).rows.map((row) => row.id)).toEqual([VOLGA]);
	});

	it('filters by kind and drops a tampered filter instead of failing', () => {
		expect(list({ kind: 'component' }).rows.every((row) => row.kind === 'component')).toBe(true);
		expect(stockFiltersSchema.parse({ kind: 'weapon', negative: 'yes' })).toEqual({});
		expect(stockFiltersSchema.parse({ kind: 'product', negative: 'true' })).toEqual({
			kind: 'product',
			negative: true
		});
	});
});

describe('stock items', () => {
	it('creates an item, edits it and writes both to the audit', () => {
		const id = items().create({
			kind: 'component',
			code: 'CMP-NEW',
			title: 'Гвозди',
			unitId: PCS,
			minThreshold: 10
		});
		items().update(id, {
			code: 'CMP-NEW',
			title: 'Гвозди 50 мм',
			unitId: PCS,
			minThreshold: 20,
			isActive: true
		});

		expect(items().card(id)).toMatchObject({ title: 'Гвозди 50 мм', minThreshold: 20, balance: 0 });
		expect(audit('stock.item.create')).toHaveLength(1);
		expect(audit('stock.item.update')[0]).toMatchObject({ entity: 'stock_items', entityId: id });
	});

	it('refuses a taken code and a unit outside the dictionary', () => {
		const item = { kind: 'component', title: 'Дубль', minThreshold: 0 } as const;
		expect(() => items().create({ ...item, code: 'CMP-BOARD-PINE', unitId: PCS })).toThrow(
			ValidationError
		);
		expect(() => items().create({ ...item, code: 'CMP-OTHER', unitId: CORRECTION })).toThrow(
			ValidationError
		);
	});

	it('rejects a form without a code, with a negative threshold or an unknown kind', () => {
		const form = { kind: 'component', code: 'A', title: 'B', unitId: '1', minThreshold: '0' };
		expect(stockItemCreateSchema.safeParse(form).success).toBe(true);
		expect(stockItemCreateSchema.safeParse({ ...form, code: ' ' }).success).toBe(false);
		expect(stockItemCreateSchema.safeParse({ ...form, minThreshold: '-1' }).success).toBe(false);
		expect(stockItemCreateSchema.safeParse({ ...form, kind: 'tool' }).success).toBe(false);
	});
});
