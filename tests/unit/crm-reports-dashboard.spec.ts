import { beforeEach, describe, expect, it } from 'vitest';
import { DashboardService } from '../../src/lib/server/crm-reports/dashboard.service';
import { isoDay } from '../../src/lib/utils/format';
import { seedReportWorld } from './helpers/crm-reports';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';
import { totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { owner, inWork, assembled, delivered, world } = seedReportWorld(db);
// The service reads org.timezone itself here; the fixture keeps the workshop in Moscow.
const today = isoDay(new Date().toISOString(), 'Europe/Moscow');
const dashboard = (from = today, to = today) => new DashboardService(owner).dashboard({ from, to });

beforeEach(() => resetRequests(db));

describe('owner dashboard (C13)', () => {
	it('puts the period figures and the state of the workshop on one screen', () => {
		// Furthest first: the shelf fills the oldest request, so a waiting one would take the pieces.
		const sold = delivered(2);
		assembled(1);
		inWork(1);

		const result = dashboard();

		expect(result.sales).toMatchObject({ requestCount: 1, totalMinor: totalOf(sold) });
		expect(result.debtMinor).toBe(totalOf(sold));
		expect(result.statusCounts).toMatchObject({
			new: 0,
			in_work: 1,
			ready: 1,
			awaiting_payment: 1,
			paid: 0
		});
		expect(result.charityAccruedInRangeMinor).toBeGreaterThan(0);
		expect(result.charityRemainderMinor).toBe(result.charityAccruedInRangeMinor);
		expect(result.topCounterparties).toEqual([
			expect.objectContaining({ counterpartyId: world.cpId })
		]);
		expect(result.topModels).toHaveLength(1);
		expect(result.payrollAccruedMinor).toBe(0);
	});

	it('keeps the state of today when the period is empty', () => {
		inWork(1);
		const result = dashboard('2020-01-01', '2020-01-31');
		expect(result.sales.requestCount).toBe(0);
		expect(result.statusCounts.in_work).toBe(1);
		expect(result.topCounterparties).toEqual([]);
	});
});
