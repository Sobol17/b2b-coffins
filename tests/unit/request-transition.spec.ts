import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, requests } from '../../src/lib/server/db/schema';
import { JOB_PAYLOAD_SCHEMAS } from '../../src/lib/server/queue/topics';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../src/lib/server/request/request-submit.service';
import type { RequestStatus } from '../../src/lib/types/request';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import {
	assign,
	dictId,
	fanouts,
	history,
	move,
	pay,
	refused,
	statusOf,
	totalOf
} from './helpers/transitions';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const adminCtx = portalActor('cp_admin', world.adminId, world.cpId);
const employeeCtx = portalActor('cp_employee', world.employeeId, world.cpId);
const outsiderCtx = portalActor('cp_admin', world.outsiderId, world.otherCpId);

const managerId = insertUser({ email: 'mgr@shop.example', role: 'manager', counterpartyId: null });
const carpenterId = insertUser({
	email: 'carp@shop.example',
	role: 'carpenter',
	counterpartyId: null
});
const driverId = insertUser({ email: 'drv@shop.example', role: 'driver', counterpartyId: null });
const managerCtx = crmActor('manager', managerId);
const carpenterCtx = crmActor('carpenter', carpenterId);
const driverCtx = crmActor('driver', driverId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const pickup = { deliveryAddressId: null, isPickup: true, comment: null };

/** A request in `new`: where every move of tech.md 6.2 starts. */
function sent(): number {
	new DraftService(adminCtx).addItem({ variantId: VOLGA_180, qty: 2, optionIds: [] });
	return new RequestSubmitService(adminCtx).submit(pickup).id;
}

/**
 * Walks the acceptance path of P5 and stops at `upTo`. Cash collected at the door is a payment
 * mark written before the delivery move, the way the driver's checkbox will write it in C6.
 */
function drive(id: number, upTo: RequestStatus): void {
	assign(id, carpenterId, 'carpenter');
	assign(id, driverId, 'driver');
	move(managerCtx, id, 'in_work');
	if (upTo === 'in_work') return;
	move(carpenterCtx, id, 'ready');
	if (upTo === 'ready') return;
	if (upTo === 'paid') pay(id, totalOf(id), driverId);
	move(driverCtx, id, 'delivered');
}

beforeEach(() => resetRequests(db));

describe('request transitions (P5)', () => {
	it('walks new -> in_work -> ready -> delivered -> awaiting_payment -> paid on cash', () => {
		const id = sent();

		drive(id, 'paid');

		expect(statusOf(id)).toBe('paid');
		expect(history(id).map((row) => `${row.fromStatus}->${row.toStatus}`)).toEqual([
			'draft->new',
			'new->in_work',
			'in_work->ready',
			'ready->delivered',
			'delivered->awaiting_payment',
			'awaiting_payment->paid'
		]);
	});

	it('stamps the moment of every status the table names', () => {
		const id = sent();

		drive(id, 'paid');

		const [row] = db.select().from(requests).where(eq(requests.id, id)).all();
		expect({
			accepted: row?.acceptedAt !== null,
			ready: row?.readyAt !== null,
			delivered: row?.deliveredAt !== null,
			paid: row?.paidAt !== null
		}).toEqual({ accepted: true, ready: true, delivered: true, paid: true });
	});

	it('stops a delivery billed by invoice at awaiting_payment', () => {
		const id = sent();

		drive(id, 'delivered');

		expect(statusOf(id)).toBe('awaiting_payment');
		expect(history(id).at(-1)).toMatchObject({ toStatus: 'awaiting_payment', actorId: null });
	});

	it('writes the automatic steps without an actor and leaves the manual one with its own', () => {
		const id = sent();

		drive(id, 'paid');

		const automatic = history(id).slice(-2);
		expect(automatic.map((row) => [row.toStatus, row.actorId])).toEqual([
			['awaiting_payment', null],
			['paid', null]
		]);
		expect(history(id).at(-3)).toMatchObject({ toStatus: 'delivered', actorId: driverId });
	});

	it('keeps a partly paid delivery in awaiting_payment', () => {
		const id = sent();
		assign(id, carpenterId, 'carpenter');
		assign(id, driverId, 'driver');
		move(managerCtx, id, 'in_work');
		move(carpenterCtx, id, 'ready');
		pay(id, totalOf(id) - 1, driverId);

		move(driverCtx, id, 'delivered');

		expect(statusOf(id)).toBe('awaiting_payment');
	});

	it('refuses to let a human close the request by hand', () => {
		const id = sent();
		drive(id, 'delivered');
		pay(id, totalOf(id), managerId);

		expect(refused(() => move(managerCtx, id, 'paid'))).toEqual({
			name: 'ForbiddenError',
			status: 403
		});
		expect(statusOf(id)).toBe('awaiting_payment');
	});

	it('answers 409 to a move the table does not list', () => {
		const id = sent();

		expect(refused(() => move(managerCtx, id, 'ready'))).toEqual({
			name: 'ConflictError',
			status: 409
		});
		expect(statusOf(id)).toBe('new');
	});

	it('answers 409 while the request has no assignee', () => {
		const id = sent();

		expect(refused(() => move(managerCtx, id, 'in_work')).status).toBe(409);
		expect(history(id)).toHaveLength(1);
	});

	it('answers 403 on a request of another counterparty', () => {
		const id = sent();

		expect(refused(() => move(outsiderCtx, id, 'cancelled'))).toEqual({
			name: 'ForbiddenError',
			status: 403
		});
	});

	it('cancels the own request for the administrator and hides it from the employee', () => {
		const id = sent();

		expect(refused(() => move(employeeCtx, id, 'cancelled')).status).toBe(403);
		expect(move(adminCtx, id, 'cancelled').status).toBe('cancelled');
		expect(history(id).at(-1)).toMatchObject({ toStatus: 'cancelled', actorId: world.adminId });
	});

	it('keeps an unassigned carpenter out of the workshop move', () => {
		const id = sent();
		assign(id, driverId, 'driver');
		move(managerCtx, id, 'in_work');

		expect(refused(() => move(carpenterCtx, id, 'ready')).status).toBe(403);
	});

	it('answers 404 for a request that does not exist', () => {
		expect(refused(() => move(managerCtx, 999_999, 'in_work'))).toEqual({
			name: 'NotFoundError',
			status: 404
		});
	});

	it('demands a dictionary reason before the manager rejects a request', () => {
		const id = sent();

		expect(refused(() => move(managerCtx, id, 'rejected'))).toEqual({
			name: 'ValidationError',
			status: 422
		});
		expect(
			refused(() => move(managerCtx, id, 'rejected', { reasonId: dictId('material', 'pine') }))
		).toEqual({ name: 'ValidationError', status: 422 });

		const reason = dictId('refusal_reason', 'no_capacity');
		expect(move(managerCtx, id, 'rejected', { reasonId: reason }).status).toBe('rejected');
		expect(history(id).at(-1)).toMatchObject({ toStatus: 'rejected', reasonId: reason });
	});

	it('queues one fanout per event and keeps the payload inside the queue contract', () => {
		const id = sent();

		drive(id, 'ready');

		const ready = fanouts('request.ready');
		expect(ready).toHaveLength(1);
		expect(JOB_PAYLOAD_SCHEMAS['notification.fanout'].parse(ready[0]?.payload)).toEqual({
			eventKey: 'request.ready',
			entityId: id
		});
	});

	it('writes every move to the audit journal', () => {
		const id = sent();

		drive(id, 'in_work');

		const rows = db.select().from(auditLog).where(eq(auditLog.action, 'request.transition')).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ entity: 'requests', entityId: id, actorId: managerId });
	});

	it('keeps money out of the answer given to a price-blind role', () => {
		const id = sent();
		drive(id, 'in_work');

		const moved = move(carpenterCtx, id, 'ready');

		expect(Object.keys(moved)).toEqual(['id', 'number', 'status']);
	});
});
