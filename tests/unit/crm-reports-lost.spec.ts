import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { LostReportService } from '../../src/lib/server/crm-reports/lost-report.service';
import { isoDay } from '../../src/lib/utils/format';
import { lostReportSchema } from '../../src/lib/validation/crm-reports';
import { seedCharityWorld } from './helpers/charity';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, resetRequests } from './helpers/portal-requests';
import { dictId, move, totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { actors, sent } = seedCharityWorld(db);
const owner = crmActor(
	'owner',
	insertUser({ email: 'own@lost.example', role: 'owner', counterpartyId: null })
);
const TZ = 'Europe/Moscow';
const today = isoDay(new Date().toISOString(), TZ);
const service = () => new LostReportService(owner, undefined, TZ);
const input = (patch: Record<string, string> = {}) =>
	lostReportSchema.parse({ from: today, to: today, ...patch });
const report = (patch: Record<string, string> = {}) =>
	service().report(input(patch), normalizeListQuery({}));

beforeEach(() => resetRequests(db));

describe('cancelled and rejected requests (C13)', () => {
	it('lists the request with who lost it, why and for how much', () => {
		const cancelled = sent();
		move(actors.admin, cancelled, 'cancelled');
		const rejected = sent();
		const reasonId = dictId('refusal_reason', 'no_capacity');
		move(actors.manager, rejected, 'rejected', { reasonId, comment: 'Нет материала' });

		const result = report();

		expect(result).toMatchObject({
			cancelledCount: 1,
			rejectedCount: 1,
			totalMinor: totalOf(cancelled) + totalOf(rejected)
		});
		expect(result.page.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					requestId: rejected,
					status: 'rejected',
					comment: 'Нет материала',
					totalMinor: totalOf(rejected)
				}),
				expect.objectContaining({ requestId: cancelled, status: 'cancelled', reasonTitle: null })
			])
		);
		expect(result.reasons.find((r) => r.reasonId === null)).toMatchObject({
			title: 'Без причины',
			count: 1
		});
		expect(report({ status: 'rejected' }).page.total).toBe(1);
		expect(service().exportRows(input())).toHaveLength(2);
	});

	it('is empty for a period without losses', () => {
		expect(report({ from: '2020-01-01', to: '2020-01-31' })).toMatchObject({
			cancelledCount: 0,
			rejectedCount: 0,
			totalMinor: 0,
			reasons: []
		});
	});
});
