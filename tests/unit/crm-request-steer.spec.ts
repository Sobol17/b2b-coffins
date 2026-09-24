import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { CrmRequestCreateService } from '../../src/lib/server/crm-request/crm-request-create.service';
import { CrmRequestPriorityService } from '../../src/lib/server/crm-request/crm-request-priority.service';
import { CrmRequestItemsService } from '../../src/lib/server/crm-request/crm-request-items.service';
import { auditLog, requestItems, requests } from '../../src/lib/server/db/schema';
import { RequestCardService } from '../../src/lib/server/request/request-card.service';
import { crmRequestCreateSchema } from '../../src/lib/validation/crm-request';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	optionId,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { history, move, stockUp } from './helpers/transitions';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const managerId = insertUser({
	email: 'mgr@ws.example',
	role: 'manager',
	counterpartyId: null,
	fullName: 'Марина Круглова'
});
const carpenterId = insertUser({
	email: 'carp@ws.example',
	role: 'carpenter',
	counterpartyId: null,
	fullName: 'Пётр Столяров'
});
const manager = crmActor('manager', managerId);
const priorities = () => new CrmRequestPriorityService(manager);
const items = () => new CrmRequestItemsService(manager);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const WALNUT = optionId(db, 'Орех');

function newRequest(): number {
	return new CrmRequestCreateService(manager).create(
		crmRequestCreateSchema.parse({
			kind: 'counterparty',
			counterpartyId: String(world.cpId),
			deliveryAddressId: String(world.homeAddressId),
			deliveryDate: '2026-12-01',
			deliveryTime: '10:00',
			deceasedName: 'Иванов Иван Иванович',
			lines: [{ variantId: String(VOLGA_180), qty: '2' }]
		})
	).id;
}

function accepted(): number {
	const id = newRequest();
	move(manager, id, 'in_work');
	return id;
}

const totals = (id: number) =>
	db
		.select({
			items: requests.itemsTotalMinor,
			discount: requests.discountMinor,
			total: requests.totalMinor,
			priority: requests.priority
		})
		.from(requests)
		.where(eq(requests.id, id))
		.all()[0];
const lines = (id: number) =>
	db
		.select()
		.from(requestItems)
		.where(eq(requestItems.requestId, id))
		.orderBy(requestItems.id)
		.all();
const notes = (id: number) => history(id).filter((row) => row.fromStatus === row.toStatus);

beforeEach(() => resetRequests(db));

describe('the priority of a request (C4)', () => {
	it('changes the priority before the acceptance without a history line', () => {
		const id = newRequest();
		priorities().setPriority(id, 'urgent');
		expect(totals(id)?.priority).toBe('urgent');
		expect(notes(id)).toEqual([]);
		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'request.priority')).all()
		).toHaveLength(1);
	});

	it('changes the priority and closes steering once the request is delivered', () => {
		const id = accepted();
		priorities().setPriority(id, 'urgent');
		expect(totals(id)?.priority).toBe('urgent');
		expect(notes(id).at(-1)?.comment).toBe('Приоритет: Срочно');
		stockUp(id);
		move(manager, id, 'ready');
		move(manager, id, 'delivered');
		expect(() => priorities().setPriority(id, 'normal')).toThrow(ConflictError);
	});

	it('answers 404 for an unknown request', () => {
		expect(() => priorities().setPriority(999_999, 'urgent')).toThrow(NotFoundError);
	});
});

describe('the lines before the acceptance (C4)', () => {
	it('reprice the whole request at the current prices without a history line', () => {
		const id = newRequest();
		items().addLine(id, { variantId: VOLGA_180, optionId: WALNUT, qty: 1, comment: null });
		const [first] = lines(id);
		items().setQty(id, { itemId: first?.id ?? 0, qty: 4, comment: null });
		// Partner price 8 300 ₽: 4 + 1 pieces, contract discount 5 %.
		expect(totals(id)).toMatchObject({ items: 4_150_000, discount: 207_500, total: 3_942_500 });
		expect(notes(id)).toEqual([]);
	});

	it('keep at least one line', () => {
		const id = newRequest();
		const [only] = lines(id);
		expect(() => items().removeLine(id, { itemId: only?.id ?? 0, comment: null })).toThrow(
			ConflictError
		);
	});
});

describe('the lines after the launch (C4 DoD)', () => {
	it('need a reason and write it into history', () => {
		const id = accepted();
		const [first] = lines(id);
		expect(() => items().setQty(id, { itemId: first?.id ?? 0, qty: 3, comment: null })).toThrow(
			ValidationError
		);
		items().setQty(id, { itemId: first?.id ?? 0, qty: 3, comment: 'Клиент попросил третий' });
		expect(notes(id).map((row) => row.comment)).toEqual([
			'Количество MDL-201-180-PIN: 2 → 3. Клиент попросил третий'
		]);
		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'request.items_update')).all()
		).toHaveLength(1);
	});

	it('keep the frozen piece price and the share of the discount when the list price moves', () => {
		const id = accepted();
		const [first] = lines(id);
		// The price list moved after the acceptance: the accepted line must not follow it.
		db.update(requestItems)
			.set({ unitPriceMinor: 700_000, lineTotalMinor: 1_400_000 })
			.where(eq(requestItems.id, first?.id ?? 0))
			.run();
		db.update(requests)
			.set({ itemsTotalMinor: 1_400_000, discountMinor: 70_000, totalMinor: 1_330_000 })
			.where(eq(requests.id, id))
			.run();

		items().setQty(id, { itemId: first?.id ?? 0, qty: 4, comment: 'Ещё два' });
		expect(lines(id)[0]).toMatchObject({ unitPriceMinor: 700_000, lineTotalMinor: 2_800_000 });
		expect(totals(id)).toMatchObject({ items: 2_800_000, discount: 140_000, total: 2_660_000 });
	});

	it("price a new line at today's personal price", () => {
		const id = accepted();
		items().addLine(id, { variantId: VOLGA_180, optionId: WALNUT, qty: 1, comment: 'Второй цвет' });
		expect(lines(id).map((line) => line.unitPriceMinor)).toEqual([830_000, 830_000]);
		expect(totals(id)?.items).toBe(2_490_000);
	});

	it('are closed once the product is made, and closed to the crew', () => {
		const id = accepted();
		stockUp(id);
		move(manager, id, 'ready');
		const [first] = lines(id);
		expect(() => items().setQty(id, { itemId: first?.id ?? 0, qty: 1, comment: 'поздно' })).toThrow(
			ConflictError
		);
		expect(() => new CrmRequestItemsService(crmActor('carpenter', carpenterId))).toThrow(
			ForbiddenError
		);
	});

	it('refuse a line of another request', () => {
		const id = accepted();
		const other = newRequest();
		const [foreign] = lines(other);
		expect(() =>
			items().setQty(id, { itemId: foreign?.id ?? 0, qty: 3, comment: 'чужая' })
		).toThrow(NotFoundError);
	});
});

describe('the notes stay in the workshop (C4)', () => {
	it('keeps the portal card on the moves of the request only', () => {
		const id = accepted();
		priorities().setPriority(id, 'urgent');
		const card = new RequestCardService(portalActor('cp_admin', world.adminId, world.cpId)).card(
			id
		);
		expect(card.history.map((step) => [step.fromStatus, step.toStatus])).toEqual([
			['draft', 'new'],
			['new', 'in_work']
		]);
	});
});
