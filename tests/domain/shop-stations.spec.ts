import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	nextStation,
	stationOrder,
	type StationOrderFacts
} from '../../src/lib/domain/shop/stations';
import { WORK_ROLES } from '../../src/lib/types/roles';

const DAY_MS = 86_400_000;
const base = new Date('2026-10-29T09:00:00Z').getTime();

function facts(
	overrides: Partial<StationOrderFacts> & Pick<StationOrderFacts, 'id'>
): StationOrderFacts {
	return { isUrgent: false, deliveryAt: null, acceptedAt: new Date(base), ...overrides };
}

describe('order of the stations (tech.md §20.4)', () => {
	it('walks carpenter, grinder, painter, upholsterer and then stops', () => {
		expect(WORK_ROLES.map(nextStation)).toEqual(['grinder', 'painter', 'upholsterer', null]);
	});
});

describe('order of the visits on a station (tech.md §20.4)', () => {
	it('puts an urgent visit before a normal one due earlier', () => {
		const urgent = facts({ id: 2, isUrgent: true });
		const soon = facts({ id: 1, deliveryAt: new Date(base + DAY_MS) });

		expect([soon, urgent].sort(stationOrder).map((row) => row.id)).toEqual([2, 1]);
	});

	it('puts a visit without a deadline after any deadline, then by acceptance and id', () => {
		const late = facts({ id: 1, deliveryAt: new Date(base + 9 * DAY_MS) });
		const open = facts({ id: 2 });
		const openEarlier = facts({ id: 4, acceptedAt: new Date(base - DAY_MS) });
		const openSame = facts({ id: 3 });

		expect([open, openSame, openEarlier, late].sort(stationOrder).map((row) => row.id)).toEqual([
			1, 4, 2, 3
		]);
	});

	it('is a total order: antisymmetric and zero only for the same id', () => {
		const row = fc.record({
			id: fc.integer({ min: 1, max: 20 }),
			isUrgent: fc.boolean(),
			deliveryAt: fc.option(
				fc.integer({ min: 0, max: 3 }).map((d) => new Date(base + d * DAY_MS)),
				{
					nil: null
				}
			),
			acceptedAt: fc.option(
				fc.integer({ min: 0, max: 3 }).map((d) => new Date(base + d * DAY_MS)),
				{
					nil: null
				}
			)
		});
		expect(() =>
			fc.assert(
				fc.property(row, row, (a, b) => {
					const ab = Math.sign(stationOrder(a, b));
					const ba = Math.sign(stationOrder(b, a));
					return ab === -ba && (ab !== 0 || a.id === b.id);
				})
			)
		).not.toThrow();
	});
});
