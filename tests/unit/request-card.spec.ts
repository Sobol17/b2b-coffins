import { beforeEach, describe, expect, it } from 'vitest';
import { RequestCardService } from '../../src/lib/server/request/request-card.service';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { send } from './helpers/registry';
import { move, pay, refused, stockUp, totalOf } from './helpers/transitions';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const adminCtx = portalActor('cp_admin', world.adminId, world.cpId);
const employeeCtx = portalActor('cp_employee', world.employeeId, world.cpId);
const outsiderCtx = portalActor('cp_admin', world.outsiderId, world.otherCpId);

const managerId = insertUser({ email: 'mgr@shop.example', role: 'manager', counterpartyId: null });
const driverId = insertUser({ email: 'drv@shop.example', role: 'driver', counterpartyId: null });
const managerCtx = crmActor('manager', managerId);
const driverCtx = crmActor('driver', driverId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');

function card(id: number, ctx = adminCtx) {
	return new RequestCardService(ctx).card(id);
}

/** Drives the request to `paid`, so the card has the full history including the automatic steps. */
function deliver(id: number): void {
	move(managerCtx, id, 'in_work');
	stockUp(id);
	move(managerCtx, id, 'ready');
	pay(id, totalOf(id), driverId);
	move(driverCtx, id, 'delivered');
}

beforeEach(() => resetRequests(db));

describe('portal request card (P6)', () => {
	it('carries the composition of the request with its pieces', () => {
		const id = send(adminCtx, VOLGA_180);

		const dto = card(id);

		expect(dto.items).toHaveLength(1);
		expect(dto.items[0]?.qty).toBe(2);
		expect(dto.unitCount).toBe(2);
		expect(dto.items[0]?.productTitle).toContain('Волга');
	});

	it('gives the administrator the frozen sums and the contract discount', () => {
		const id = send(adminCtx, VOLGA_180);

		const dto = card(id);

		expect(dto.itemsTotalMinor).toBeGreaterThan(0);
		expect(dto.totalMinor).toBe((dto.itemsTotalMinor ?? 0) - (dto.discountMinor ?? 0));
		expect(dto.discountPercent).toBe(5);
	});

	it('gives the employee the same card without a single money key', () => {
		const id = send(employeeCtx, VOLGA_180);

		const dto = card(id, employeeCtx);

		expect(dto.items).toHaveLength(1);
		expect(JSON.stringify(dto)).not.toContain('Minor');
		expect(dto.discountPercent).toBeUndefined();
	});

	it('shows the shipment: the address, the deadline and the deceased', () => {
		const delivery = send(adminCtx, VOLGA_180, {
			deliveryAddressId: world.homeAddressId,
			deliveryAt: new Date('2026-12-01T10:00:00.000Z'),
			deceasedName: 'Иванов Иван Иванович'
		});

		expect(card(delivery)).toMatchObject({
			deliveryAt: '2026-12-01T10:00:00.000Z',
			deceasedName: 'Иванов Иван Иванович'
		});
		expect(card(delivery).deliveryAddress).toContain('Полевая');
	});

	it('writes the automatic steps of the history without an actor', () => {
		const id = send(adminCtx, VOLGA_180);
		deliver(id);

		const steps = card(id).history;

		expect(steps.map((step) => step.toStatus)).toEqual([
			'new',
			'in_work',
			'ready',
			'delivered',
			'awaiting_payment',
			'paid'
		]);
		expect(steps.at(-1)?.actorName).toBeNull();
		expect(steps[0]?.actorName).toBe('Ольга Смирнова');
	});

	it('offers the administrator the cancel move while the request is only sent', () => {
		const id = send(adminCtx, VOLGA_180);

		expect(card(id).targets).toContain('cancelled');
	});

	it('offers no move once the workshop took the request', () => {
		const id = send(adminCtx, VOLGA_180);
		move(managerCtx, id, 'in_work');

		expect(card(id).targets).toEqual([]);
	});

	it('answers 403 for a request of another counterparty', () => {
		const id = send(adminCtx, VOLGA_180);

		expect(refused(() => card(id, outsiderCtx))).toEqual({ name: 'ForbiddenError', status: 403 });
	});

	it('answers 403 to an employee opening the request of a colleague', () => {
		const id = send(adminCtx, VOLGA_180);

		expect(refused(() => card(id, employeeCtx))).toEqual({ name: 'ForbiddenError', status: 403 });
	});

	it('answers 404 for a request that does not exist', () => {
		expect(refused(() => card(4242))).toEqual({ name: 'NotFoundError', status: 404 });
	});
});
