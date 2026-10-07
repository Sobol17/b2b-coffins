import { beforeEach, describe, expect, it } from 'vitest';
import { stockMoves } from '../../src/lib/server/db/schema';
import { StockTurnoverService } from '../../src/lib/server/crm-reports/stock-turnover.service';
import { isoDay } from '../../src/lib/utils/format';
import { stockTurnoverSchema } from '../../src/lib/validation/crm-reports';
import { migratedDatabase } from './helpers/db';
import { seedReportWorld } from './helpers/crm-reports';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { owner, assembled, produce, delivery, lineOf } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const report = (from: string, to: string) =>
	new StockTurnoverService(owner, undefined, TZ).report(stockTurnoverSchema.parse({ from, to }));
// The day of the workshop, not of UTC: the two differ for three hours every night.
const today = () => isoDay(new Date().toISOString(), TZ);
/** Moves every move of the shelf to one instant: the test owns the calendar. */
const stamp = (iso: string) =>
	db
		.update(stockMoves)
		.set({ occurredAt: new Date(iso) })
		.run();

beforeEach(() => {
	resetRequests(db);
	db.delete(stockMoves).run();
});

describe('stock turnover report (C13)', () => {
	it('splits the shelf into opening, income, outcome and closing', () => {
		produce(10);
		stamp('2026-09-15T09:00:00Z');
		const id = assembled(4); // makes 4 more and holds them for the request
		const line = lineOf(id);
		delivery().load({ itemId: line.itemId, qty: 4 });

		const [row] = report(today(), today()).rows;

		expect(row).toMatchObject({
			openingQty: 10,
			incomeQty: 4,
			outcomeQty: 4,
			closingQty: 10,
			shippedQty: 4
		});
		// Average shelf 10, one day, 4 shipped: 10 * 1 / 4 rounds to 3 days.
		expect(row?.turnoverDays).toBe(3);
	});

	it('takes a loading the driver took back out of the shipped pieces', () => {
		const id = assembled(4);
		const line = lineOf(id);
		delivery().load({ itemId: line.itemId, qty: 4 });
		delivery().unload({ itemId: line.itemId });

		const [row] = report(today(), today()).rows;

		expect(row).toMatchObject({ shippedQty: 0, closingQty: 4, turnoverDays: null });
	});

	it('lists only positions that had a shelf or a move, and nothing for an empty period', () => {
		produce(3);
		expect(report('2020-01-01', '2020-01-31').rows).toEqual([]);
		expect(report(today(), today()).rows).toHaveLength(1);
	});
});
