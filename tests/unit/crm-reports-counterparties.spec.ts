import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { CounterpartyReportService } from '../../src/lib/server/crm-reports/counterparty-report.service';
import { stockItems } from '../../src/lib/server/db/schema';
import { counterpartyReportSchema } from '../../src/lib/validation/crm-reports';
import { stockItemId } from './helpers/crm-stock';
import { migratedDatabase } from './helpers/db';
import { seedReportWorld } from './helpers/crm-reports';
import { resetRequests } from './helpers/portal-requests';
import { totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { owner, actors, delivered, toStock, world } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
const VOLGA = stockItemId(db, 'MDL-201-180-PIN');
const at = (iso: string) => new Date(iso);
const report = (patch: Record<string, string> = {}, ctx = owner) =>
	new CounterpartyReportService(ctx, undefined, TZ).report(
		counterpartyReportSchema.parse({ ...OCTOBER, ...patch })
	);

function cost(minor: number): void {
	db.update(stockItems).set({ costPriceMinor: minor }).where(eq(stockItems.id, VOLGA)).run();
}

beforeEach(() => {
	resetRequests(db);
	cost(300_000);
});

describe('sales by counterparty with the margin (v1.63)', () => {
	it('takes the margin as the total minus pieces times the cost of the stock item', () => {
		const first = delivered(2, at('2026-10-03T09:00:00Z'));
		const second = delivered(1, at('2026-10-20T09:00:00Z'));
		const total = totalOf(first) + totalOf(second);

		const { rows, totals } = report();

		expect(rows).toEqual([
			expect.objectContaining({
				counterpartyId: world.cpId,
				requestCount: 2,
				qty: 3,
				totalMinor: total,
				costMinor: 900_000,
				marginMinor: total - 900_000,
				marginBp: Math.round(((total - 900_000) * 10_000) / total),
				uncostedQty: 0
			})
		]);
		expect(totals).toMatchObject({ requestCount: 2, costMinor: 900_000 });
	});

	it('counts the pieces without a cost, so the owner sees the margin is too high', () => {
		cost(0);
		delivered(2, at('2026-10-03T09:00:00Z'));

		expect(report().rows[0]).toMatchObject({ costMinor: 0, uncostedQty: 2 });
	});

	it('opens the requests of a chosen counterparty, the newest first, adding up to its row', () => {
		const older = delivered(2, at('2026-10-03T09:00:00Z'));
		const newer = delivered(1, at('2026-10-20T09:00:00Z'));

		expect(report().requests).toEqual([]);
		const chosen = report({ counterpartyId: String(world.cpId) });

		expect(chosen.requests.map((row) => row.requestId)).toEqual([newer, older]);
		expect(chosen.requests[1]).toMatchObject({
			qty: 2,
			totalMinor: totalOf(older),
			costMinor: 600_000,
			marginMinor: totalOf(older) - 600_000,
			status: 'awaiting_payment'
		});
		const sum = chosen.requests.reduce((s, row) => s + row.marginMinor, 0);
		expect(sum).toBe(chosen.rows[0]?.marginMinor);
	});

	it('reads the same sales as the sales report: no stock requests, nothing out of the dates', () => {
		const inside = delivered(1, at('2026-10-31T20:30:00Z')); // 23:30 Moscow on the 31st
		delivered(1, at('2026-10-31T21:10:00Z')); // November in Moscow
		toStock(delivered(3, at('2026-10-10T09:00:00Z')));

		expect(report().totals).toMatchObject({ requestCount: 1, totalMinor: totalOf(inside) });
		expect(report({ counterpartyId: String(world.otherCpId) }).rows).toEqual([]);
	});

	it('is the owner’s only: the administrator gets 403', () => {
		expect(() => report({}, actors.manager)).toThrow(ForbiddenError);
		expect(() => report({}, actors.driver)).toThrow(ForbiddenError);
	});
});
