import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharityRepository } from '../../src/lib/server/charity/charity.repository';
import { CharityTotalsRepository } from '../../src/lib/server/charity/charity-totals.repository';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { withTransaction } from '../../src/lib/server/core/tx';
import { CharityReportService } from '../../src/lib/server/crm-reports/charity-report.service';
import { CharityTransferService } from '../../src/lib/server/crm-reports/charity-transfer.service';
import { auditLog, charityTransfers } from '../../src/lib/server/db/schema';
import { tallyCharity } from '../../src/lib/domain/charity/rate';
import { isoDay } from '../../src/lib/utils/format';
import {
	charityTransferReverseSchema,
	charityTransferSchema
} from '../../src/lib/validation/crm-reports';
import { charityOf } from './helpers/charity';
import { seedReportWorld } from './helpers/crm-reports';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { owner, actors, delivered, toStock, world } = seedReportWorld(db);
const TZ = 'Europe/Moscow';
const today = isoDay(new Date().toISOString(), TZ);
const report = (from = today, to = today) =>
	new CharityReportService(owner, undefined, undefined, TZ).report(
		{ from, to },
		normalizeListQuery({})
	);
const transfers = () => new CharityTransferService(owner, undefined, undefined, TZ);
const transfer = (amountMinor: number, patch: Record<string, string> = {}) =>
	transfers().transfer(
		charityTransferSchema.parse({
			amountMinor: String(amountMinor),
			transferredOn: today,
			...patch
		})
	);
const reverse = (transferId: number, comment = 'Не тот счёт') =>
	transfers().reverse(
		charityTransferReverseSchema.parse({ transferId: String(transferId), comment })
	);
const audit = (action: string) =>
	db.select().from(auditLog).where(eq(auditLog.action, action)).all();

beforeEach(() => {
	db.delete(charityTransfers).run();
	resetRequests(db);
});

describe('fund report and transfers (C13, tech.md v1.51)', () => {
	it('shows the same accrued total the banner is rebuilt from', () => {
		const a = delivered(2);
		delivered(1);
		toStock(delivered(1));
		const banner = withTransaction((tx) => {
			const all = { kind: 'all' } as const;
			const tally = tallyCharity(new CharityRepository().frozenRows(all, tx), all, TZ);
			new CharityTotalsRepository().put('all', tally, tx);
			return tally;
		});

		const result = report();

		expect(result.accruedAllMinor).toBe(banner.amountMinor);
		expect(result.accruedAllMinor).toBe(
			new CharityTotalsRepository().findByScope('all')?.amountMinor
		);
		expect(result.accruedInRangeMinor).toBe(result.accruedAllMinor);
		expect(result.accruals).toEqual([
			{
				counterpartyId: world.cpId,
				title: expect.any(String),
				requestCount: 2,
				amountMinor: result.accruedAllMinor
			}
		]);
		expect(charityOf(db, a).amountMinor).toBeGreaterThan(0);
	});

	it('takes exactly the remainder and refuses a kopeck more', () => {
		delivered(2);
		const due = report().remainderMinor;

		expect(() => transfer(due + 1)).toThrow(ConflictError);
		const id = transfer(due, { documentRef: 'ПП 15' });

		expect(report()).toMatchObject({
			transferredAllMinor: due,
			remainderMinor: 0,
			transferredInRangeMinor: due
		});
		expect(report().transfers.rows).toEqual([
			expect.objectContaining({
				id,
				amountMinor: due,
				transferredOn: today,
				documentRef: 'ПП 15',
				reversalOfId: null,
				isReversed: false
			})
		]);
		expect(audit('charity.transfer')).toHaveLength(1);
	});

	it('gives the remainder back on a reversal and reverses a transfer once', () => {
		delivered(2);
		const due = report().remainderMinor;
		const id = transfer(due);

		reverse(id);

		expect(report()).toMatchObject({
			transferredAllMinor: 0,
			remainderMinor: due,
			transferredInRangeMinor: 0
		});
		const rows = report().transfers.rows;
		expect(rows).toHaveLength(2);
		expect(rows.find((r) => r.id === id)?.isReversed).toBe(true);
		const undo = rows.find((r) => r.reversalOfId === id);
		expect(undo).toMatchObject({ amountMinor: -due, comment: 'Не тот счёт' });
		expect(() => reverse(id)).toThrow(ConflictError);
		expect(() => reverse(undo?.id ?? 0)).toThrow(ConflictError);
		expect(audit('charity.transfer.reverse')).toHaveLength(1);
		expect(transfer(due)).toBeGreaterThan(id);
	});

	it('refuses a transfer dated tomorrow', () => {
		delivered(2);
		const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
		expect(() => transfer(100, { transferredOn: tomorrow })).toThrow(ValidationError);
	});

	it('shows zeros with nothing delivered and keeps the manager out', () => {
		expect(report()).toMatchObject({
			accruedAllMinor: 0,
			transferredAllMinor: 0,
			remainderMinor: 0,
			accruals: []
		});
		expect(() => new CharityReportService(actors.manager)).toThrow(ForbiddenError);
		expect(() => new CharityTransferService(actors.manager)).toThrow(ForbiddenError);
	});
});
