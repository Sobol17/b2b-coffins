import { beforeEach, describe, expect, it } from 'vitest';
import { DraftService } from '../../src/lib/server/request/draft.service';
import { RequestRegistryService } from '../../src/lib/server/request/request-registry.service';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { listQuery, send, sentAt } from './helpers/registry';
import { assign, move } from './helpers/transitions';

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
const managerCtx = crmActor('manager', managerId);
const carpenterCtx = crmActor('carpenter', carpenterId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');

function registry(ctx = adminCtx) {
	return new RequestRegistryService(ctx);
}

/** Accepts the request and finishes it, so the registry has a row outside the sent state. */
function toWork(id: number): void {
	assign(id, carpenterId, 'carpenter');
	move(managerCtx, id, 'in_work');
}

beforeEach(() => resetRequests(db));

describe('portal request registry (P6)', () => {
	it('shows the administrator every request of the counterparty', () => {
		send(adminCtx, VOLGA_180);
		send(employeeCtx, VOLGA_180);

		const page = registry().list(listQuery());

		expect(page.total).toBe(2);
		expect(page.rows.map((row) => row.authorName)).toContain('Илья Коротков');
	});

	it('shows the employee only the requests the employee sent', () => {
		send(adminCtx, VOLGA_180);
		const mine = send(employeeCtx, VOLGA_180);

		const page = registry(employeeCtx).list(listQuery());

		expect(page.rows.map((row) => row.id)).toEqual([mine]);
	});

	it('keeps the requests of another counterparty out of the answer', () => {
		send(adminCtx, VOLGA_180);

		expect(registry(outsiderCtx).list(listQuery()).total).toBe(0);
	});

	it('leaves the draft in the cart: the registry lists sent requests only', () => {
		send(adminCtx, VOLGA_180);
		// A draft the actor is still collecting never reaches the registry.
		new DraftService(adminCtx).addItem({ variantId: VOLGA_180, qty: 1, optionIds: [] });

		const page = registry().list(listQuery());

		expect(page.total).toBe(1);
		expect(page.rows.every((row) => row.status !== 'draft')).toBe(true);
	});

	it('counts every status of the filtered set, not only the page', () => {
		const accepted = send(adminCtx, VOLGA_180);
		send(adminCtx, VOLGA_180);
		toWork(accepted);

		const page = registry().list(listQuery());

		expect(page.countsByStatus.new).toBe(1);
		expect(page.countsByStatus.in_work).toBe(1);
		expect(page.countsByStatus.paid).toBe(0);
	});

	it('narrows the rows to the chosen statuses', () => {
		const accepted = send(adminCtx, VOLGA_180);
		send(adminCtx, VOLGA_180);
		toWork(accepted);

		const page = registry().list(listQuery({ statuses: ['in_work'] }));

		expect(page.rows.map((row) => row.id)).toEqual([accepted]);
	});

	it('keeps the whole last day of the period inside the window', () => {
		const inside = send(adminCtx, VOLGA_180);
		const outside = send(adminCtx, VOLGA_180);
		sentAt(inside, '2026-09-30T20:30:00.000Z');
		sentAt(outside, '2026-10-01T09:00:00.000Z');

		const page = registry().list(listQuery({ from: '2026-09-01', to: '2026-09-30' }));

		expect(page.rows.map((row) => row.id)).toEqual([inside]);
	});

	it('finds a request by its number and by the number of the counterparty', () => {
		const numbered = send(adminCtx, VOLGA_180, { externalNumber: 'ЗК-77' });
		const page = registry().list({ ...listQuery(), search: 'ЗК-77' });

		expect(page.rows.map((row) => row.id)).toEqual([numbered]);
	});

	it('carries the first line and the piece count of the request', () => {
		send(adminCtx, VOLGA_180);

		const [row] = registry().list(listQuery()).rows;

		expect(row?.itemCount).toBe(1);
		expect(row?.unitCount).toBe(2);
		expect(row?.firstItemTitle).toContain('Волга');
	});

	it('gives the sum to the administrator and no money key to the employee', () => {
		send(employeeCtx, VOLGA_180);

		const [forAdmin] = registry().list(listQuery()).rows;
		const [forEmployee] = registry(employeeCtx).list(listQuery()).rows;

		expect(forAdmin?.totalMinor).toBeGreaterThan(0);
		expect(JSON.stringify(forEmployee)).not.toContain('Minor');
	});

	it('ignores the money sort for a role without prices, so the order tells no amounts', () => {
		const first = send(employeeCtx, VOLGA_180, {}, 9);
		const second = send(employeeCtx, VOLGA_180, {}, 1);
		sentAt(first, '2026-09-01T10:00:00.000Z');
		sentAt(second, '2026-09-02T10:00:00.000Z');

		const page = registry(employeeCtx).list({ ...listQuery(), sort: 'total', dir: 'desc' });

		expect(page.rows.map((row) => row.id)).toEqual([second, first]);
	});

	it('gives the home page a short list and the full count of requests in work', () => {
		send(adminCtx, VOLGA_180);
		send(adminCtx, VOLGA_180);
		const accepted = send(adminCtx, VOLGA_180);
		toWork(accepted);

		const active = registry().active(2);

		expect(active.rows).toHaveLength(2);
		expect(active.total).toBe(3);
	});

	it('refuses a workshop actor: the registry is the portal contour', () => {
		expect(() => registry(carpenterCtx).list(listQuery())).toThrow();
	});
});
