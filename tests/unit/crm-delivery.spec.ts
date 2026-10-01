import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { migratedDatabase } from './helpers/db';
import { seedDeliveryWorld } from './helpers/crm-delivery';
import { resetRequests } from './helpers/portal-requests';
import { totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { actors, inWork, assembled, delivery, stop, toStock } = seedDeliveryWorld(db);

/** Every key of a JSON body, nested ones included: the price check reads the body, not the page. */
function keysOf(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(keysOf);
	if (value === null || typeof value !== 'object') return [];
	return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
}

beforeEach(() => resetRequests(db));

describe('rights on the delivery screen (C6)', () => {
	it('opens to the driver, the manager and the owner', () => {
		for (const ctx of [actors.driver, actors.manager, actors.owner]) {
			expect(delivery(ctx).overview().ready).toEqual([]);
		}
	});

	it('is closed to the shop crew and the portal: they get 403', () => {
		expect(() => delivery(actors.carpenter)).toThrow(ForbiddenError);
		expect(() => delivery(actors.admin)).toThrow(ForbiddenError);
	});
});

describe('the lists of the driver (C6 DoD)', () => {
	it('shows an assembled request among the ready ones right after the move to ready', () => {
		const id = assembled(2);

		expect(stop(id)).toMatchObject({
			status: 'ready',
			counterpartyName: 'Ритуал-Сервис',
			deceasedName: 'Иванов Иван Иванович',
			address: 'Москва, Полевая, 12',
			contactName: 'Пётр Волков',
			contactPhone: '+7 900 000-00-01',
			navigationUrl: 'https://yandex.ru/maps/?rtext=~55.8,37.7&rtt=auto',
			unitCount: 2,
			loadedCount: 0,
			canDeliver: false
		});
		expect(stop(id)?.lines).toEqual([
			expect.objectContaining({ qty: 2, loadedQty: 0, loadableQty: 2, colorTitle: 'Орех' })
		]);
	});

	it('plans the requests in work read-only: nothing to load and no money', () => {
		const id = inWork(1);

		const planned = delivery().overview().planned;

		expect(planned.map((row) => row.id)).toEqual([id]);
		expect(planned[0]?.lines[0]?.loadableQty).toBe(0);
		expect(planned[0]?.canDeliver).toBe(false);
		expect(keysOf(planned).filter((key) => key.includes('Minor'))).toEqual([]);
	});

	it('gives the driver the total of an assembled request to collect at the door', () => {
		const id = assembled(2);

		expect(stop(id)).toMatchObject({ totalMinor: totalOf(id) });
	});

	it('keeps every other money key out of the body the driver gets', () => {
		assembled(1);
		inWork(1);

		const money = keysOf(delivery().overview()).filter((key) => key.includes('Minor'));

		expect(new Set(money)).toEqual(new Set(['totalMinor']));
	});

	it('leaves stock requests off the screen: they never go to a door', () => {
		const id = assembled(1);
		toStock(id);

		expect(stop(id)).toBeUndefined();
		expect(delivery().overview().readyTotal).toBe(0);
	});

	it('counts the lists before the limit', () => {
		assembled(1);
		inWork(1);
		inWork(1);

		const screen = delivery().overview();

		expect([screen.readyTotal, screen.plannedTotal]).toEqual([1, 2]);
	});
});
