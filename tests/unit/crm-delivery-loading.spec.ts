import { and, eq, isNotNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, paymentMarks, stockMoves } from '../../src/lib/server/db/schema';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import { migratedDatabase } from './helpers/db';
import { seedDeliveryWorld } from './helpers/crm-delivery';
import { resetRequests } from './helpers/portal-requests';
import { history, refused, statusOf, totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { ids, actors, inWork, assembled, produce, writeOff, delivery, stop, lineOf, toStock } =
	seedDeliveryWorld(db);

function loadMoves(itemId: number) {
	return db
		.select()
		.from(stockMoves)
		.where(eq(stockMoves.requestItemId, itemId))
		.orderBy(stockMoves.id)
		.all();
}

function deliver(id: number, cash: boolean, ctx = actors.driver) {
	return new RequestTransitionService(ctx).deliver(id, cash);
}

function loadAll(id: number): void {
	const line = lineOf(id);
	delivery().load({ itemId: line.itemId, qty: line.qty });
}

beforeEach(() => resetRequests(db));

describe('loading marks (C6, tech.md v1.43)', () => {
	it('writes the loading as a shipment off the shelf, carrying the request and its line', () => {
		const id = assembled(3);
		const { itemId } = lineOf(id);

		delivery().load({ itemId, qty: 2 });

		expect(loadMoves(itemId)).toEqual([
			expect.objectContaining({ qty: -2, type: 'shipment', requestId: id, actorId: ids.driver })
		]);
		expect(stop(id)?.lines[0]).toMatchObject({ loadedQty: 2, loadableQty: 1 });
		const audit = db.select().from(auditLog).where(eq(auditLog.action, 'request.load')).all();
		expect(audit).toEqual([expect.objectContaining({ entity: 'requests', entityId: id })]);
	});

	it('refuses more than the line still lacks, so the same mark twice ships it once', () => {
		const id = assembled(2);
		const { itemId } = lineOf(id);
		delivery().load({ itemId, qty: 2 });

		expect(refused(() => delivery().load({ itemId, qty: 2 }))).toEqual({
			name: 'ValidationError',
			status: 422
		});
		expect(loadMoves(itemId)).toHaveLength(1);
	});

	it('refuses a loading the shelf does not hold, and writes nothing', () => {
		const id = assembled(2);
		const { itemId } = lineOf(id);
		writeOff(1);

		expect(() => delivery().load({ itemId, qty: 2 })).toThrow(
			'На складе не хватает позиций для погрузки'
		);
		expect(refused(() => delivery().load({ itemId, qty: 2 })).status).toBe(409);
		expect(loadMoves(itemId)).toEqual([]);
		delivery().load({ itemId, qty: 1 });
		expect(loadMoves(itemId)).toHaveLength(1);
	});

	it('keeps an urgent request in work from taking the pieces already loaded', () => {
		const id = assembled(2);
		const { itemId } = lineOf(id);
		delivery().load({ itemId, qty: 1 });
		inWork(1);
		produce(1);

		// One piece stays on the shelf for the rest of the line; the new piece fills the other request.
		expect(stop(id)?.lines[0]?.loadableQty).toBe(1);
	});

	it('loads only an assembled counterparty request', () => {
		const stockId = assembled(1);
		const working = inWork(1);
		const stockLine = lineOf(stockId);
		toStock(stockId);

		expect(refused(() => delivery().load({ itemId: lineOf(working).itemId, qty: 1 })).status).toBe(
			409
		);
		expect(refused(() => delivery().load({ itemId: stockLine.itemId, qty: 1 })).status).toBe(409);
		expect(refused(() => delivery().load({ itemId: 999_999, qty: 1 })).status).toBe(404);
	});
});

describe('withdrawing a loading (C6, tech.md 6.3)', () => {
	it('reverses every loading of the line and puts the pieces back on the shelf', () => {
		const id = assembled(3);
		const { itemId } = lineOf(id);
		delivery().load({ itemId, qty: 1 });
		delivery().load({ itemId, qty: 2 });

		delivery().unload({ itemId });

		const moves = loadMoves(itemId);
		expect(moves.map((row) => [row.type, row.qty])).toEqual([
			['shipment', -1],
			['shipment', -2],
			['reversal', 1],
			['reversal', 2]
		]);
		expect(moves.slice(2).map((row) => row.reversalOfId)).toEqual(
			moves.slice(0, 2).map((row) => row.id)
		);
		expect(stop(id)?.lines[0]).toMatchObject({ loadedQty: 0, loadableQty: 3 });
		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'request.unload')).all()
		).toHaveLength(1);
	});

	it('refuses a line with nothing on board and a request already delivered', () => {
		const id = assembled(1);
		const { itemId } = lineOf(id);

		expect(refused(() => delivery().unload({ itemId })).status).toBe(422);

		delivery().load({ itemId, qty: 1 });
		deliver(id, false);

		expect(refused(() => delivery().unload({ itemId })).status).toBe(409);
	});
});

describe('«Доставлено» with the cash checkbox (C6 DoD)', () => {
	it('closes a delivery paid in cash in paid with one action of the driver', () => {
		const id = assembled(2);
		loadAll(id);

		expect(deliver(id, true).status).toBe('paid');
		expect(
			history(id)
				.map((row) => row.toStatus)
				.slice(-3)
		).toEqual(['delivered', 'awaiting_payment', 'paid']);
		const marks = db.select().from(paymentMarks).where(eq(paymentMarks.requestId, id)).all();
		expect(marks).toEqual([
			expect.objectContaining({ method: 'cash', amountMinor: totalOf(id), createdById: ids.driver })
		]);
	});

	it('leaves a delivery without cash waiting in awaiting_payment', () => {
		const id = assembled(1);
		loadAll(id);

		expect(deliver(id, false).status).toBe('awaiting_payment');
		expect(db.select().from(paymentMarks).all()).toEqual([]);
	});

	it('refuses to deliver a request not loaded in full, from the server', () => {
		const id = assembled(2);
		delivery().load({ itemId: lineOf(id).itemId, qty: 1 });

		expect(refused(() => deliver(id, true))).toEqual({ name: 'ConflictError', status: 409 });
		expect(statusOf(id)).toBe('ready');
		expect(db.select().from(paymentMarks).all()).toEqual([]);
	});

	it('takes no cash for a stock request', () => {
		const id = assembled(1);
		toStock(id);

		expect(refused(() => deliver(id, true, actors.manager)).status).toBe(422);
		expect(deliver(id, false, actors.manager).status).toBe('awaiting_payment');
	});

	it('writes the cash into the audit row of the move', () => {
		const id = assembled(1);
		loadAll(id);

		deliver(id, true);

		const [row] = db
			.select()
			.from(auditLog)
			.where(and(eq(auditLog.action, 'request.transition'), isNotNull(auditLog.after)))
			.all()
			.filter((entry) => entry.entityId === id && entry.after?.['cashCollected'] === true);
		expect(row?.after).toMatchObject({ status: 'paid', cashMinor: totalOf(id) });
	});
});
