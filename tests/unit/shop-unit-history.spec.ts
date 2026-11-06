import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopLineReader } from '../../src/lib/server/crm-shop/shop-lines';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { sqlite } from '../../src/lib/server/db/client';
import { staff } from '../../src/lib/server/db/schema';
import { db, job, resetUnitPayroll, staffOf, units, world } from './helpers/shop-unit-payroll';

beforeEach(resetUnitPayroll);

describe('unit history on a request line', () => {
	it('keeps active work scoped to requested items and omits pieces without history', () => {
		const own = job('carpenter', 2);
		const another = job();
		const unitId = own.units[1]!.id;
		const itemId = new ShopService(world.actors.carpenter).task(own.taskId).jobs[0]!.itemId;
		units().take(unitId);
		units().take(another.units[0]!.id);
		db.update(staff)
			.set({ fullName: 'Столяр истории', isActive: false })
			.where(eq(staff.id, staffOf(world.ids.carpenter)))
			.run();

		const prepare = vi.spyOn(sqlite, 'prepare');
		try {
			const rows = new ShopLineReader().forRequest({ id: own.requestId, status: 'cancelled' }, [
				itemId
			]);
			expect(rows).toEqual([
				{
					itemId,
					fromStockQty: 0,
					stations: [],
					madeQty: 0,
					heldBy: [],
					units: [
						{
							id: unitId,
							works: [
								{
									station: 'carpenter',
									fullName: 'Столяр истории',
									takenAt: '2026-10-11T15:00:00.000Z',
									completedAt: null
								}
							]
						}
					]
				}
			]);
			expect(prepare.mock.calls.map(([query]) => query).join('\n')).not.toMatch(
				/rate_minor|amount_minor|phone|email|select\s+\*/i
			);
		} finally {
			prepare.mockRestore();
		}
	});
});
