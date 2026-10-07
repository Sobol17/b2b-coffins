import { beforeEach, describe, expect, it } from 'vitest';
import { FunnelReportService } from '../../src/lib/server/crm-reports/funnel-report.service';
import { isoDay } from '../../src/lib/utils/format';
import { migratedDatabase } from './helpers/db';
import { seedReportWorld } from './helpers/crm-reports';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { owner, inWork, assembled, delivered, toStock } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const today = isoDay(new Date().toISOString(), TZ);
const report = (from = today, to = today) =>
	new FunnelReportService(owner, undefined, TZ).report({ from, to });

beforeEach(() => resetRequests(db));

describe('request funnel (C13)', () => {
	it('counts how far the requests sent in the period got', () => {
		// Furthest first: the shelf fills the oldest request, so a waiting one would take the pieces.
		delivered(1);
		assembled(1);
		inWork(1);
		toStock(inWork(1));

		const result = report();

		expect(result.stages.map((s) => [s.stage, s.count])).toEqual([
			['new', 3],
			['in_work', 3],
			['ready', 2],
			['delivered', 1],
			['paid', 0]
		]);
		expect(result.stages[2]).toMatchObject({ shareOfPreviousBp: 6667, shareOfFirstBp: 6667 });
	});

	it('answers an empty period with zero stages and no shares', () => {
		const result = report('2020-01-01', '2020-01-31');
		expect(result.stages.every((s) => s.count === 0 && s.shareOfFirstBp === null)).toBe(true);
		expect(result).toMatchObject({ cancelledCount: 0, rejectedCount: 0 });
	});
});
