import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { SalesReportService } from '../../src/lib/server/crm-reports/sales-report.service';
import { salesReportSchema } from '../../src/lib/validation/crm-reports';
import { migratedDatabase } from './helpers/db';
import { seedReportWorld } from './helpers/crm-reports';
import { resetRequests } from './helpers/portal-requests';
import { totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { owner, actors, delivered, inWork, toStock, world } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
const at = (iso: string) => new Date(iso);
const report = (patch: Record<string, string> = {}) =>
	new SalesReportService(owner, undefined, TZ).report(
		salesReportSchema.parse({ ...OCTOBER, ...patch })
	);

beforeEach(() => resetRequests(db));

describe('sales report (C13, tech.md v1.51)', () => {
	it('counts delivered counterparty requests by the day of delivery in the workshop zone', () => {
		const inside = delivered(2, at('2026-10-31T20:30:00Z')); // 23:30 Moscow on the 31st
		delivered(1, at('2026-10-31T21:10:00Z')); // 00:10 Moscow on November 1st
		const stock = delivered(3, at('2026-10-10T09:00:00Z'));
		toStock(stock);
		inWork(5);

		const result = report();

		expect(result.totals).toMatchObject({ requestCount: 1, qty: 2, totalMinor: totalOf(inside) });
		expect(result.group === 'counterparty' && result.rows).toEqual([
			expect.objectContaining({
				counterpartyId: world.cpId,
				requestCount: 1,
				totalMinor: totalOf(inside)
			})
		]);
	});

	it('agrees between the three groupings', () => {
		delivered(2, at('2026-10-03T09:00:00Z'));
		delivered(1, at('2026-10-20T09:00:00Z'));

		const byCp = report();
		const byModel = report({ group: 'model' });
		const byPeriod = report({ group: 'period', bucket: 'week' });

		expect(byModel.totals).toEqual(byCp.totals);
		expect(byPeriod.totals).toEqual(byCp.totals);
		const sum = (rows: readonly { totalMinor: number }[]) =>
			rows.reduce((s, r) => s + r.totalMinor, 0);
		if (byCp.group !== 'counterparty' || byModel.group !== 'model' || byPeriod.group !== 'period')
			throw new Error('group');
		expect(sum(byCp.rows)).toBe(byCp.totals.totalMinor);
		expect(sum(byPeriod.rows)).toBe(byCp.totals.totalMinor);
		expect(byModel.rows.reduce((s, r) => s + r.linesTotalMinor, 0)).toBe(
			byCp.totals.itemsTotalMinor
		);
		expect(byModel.rows.reduce((s, r) => s + r.qty, 0)).toBe(byCp.totals.qty);
		// Every week of the range is a row, an empty one too: the owner reads the gaps as well.
		expect(byPeriod.rows.map((r) => r.bucketFrom)).toEqual([
			'2026-10-01',
			'2026-10-05',
			'2026-10-12',
			'2026-10-19',
			'2026-10-26'
		]);
	});

	it('narrows to one counterparty', () => {
		delivered(2, at('2026-10-03T09:00:00Z'));
		expect(report({ counterpartyId: String(world.otherCpId) }).totals.requestCount).toBe(0);
		expect(report({ counterpartyId: String(world.cpId) }).totals.requestCount).toBe(1);
	});

	it('answers an empty period with zeros', () => {
		expect(report().totals).toEqual({
			requestCount: 0,
			qty: 0,
			itemsTotalMinor: 0,
			discountMinor: 0,
			totalMinor: 0,
			paidMinor: 0
		});
		expect(report({ group: 'model' }).rows).toEqual([]);
	});

	it('is closed to the manager', () => {
		expect(() => new SalesReportService(actors.manager)).toThrow(ForbiddenError);
	});
});
