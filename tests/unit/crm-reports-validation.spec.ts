import { describe, expect, it } from 'vitest';
import {
	charityTransferReverseSchema,
	charityTransferSchema,
	reportRangeSchema,
	salesReportSchema
} from '../../src/lib/validation/crm-reports';

describe('report input (C13)', () => {
	it('refuses a reversed range and one longer than a year', () => {
		expect(reportRangeSchema.safeParse({ from: '2026-03-02', to: '2026-03-01' }).success).toBe(
			false
		);
		expect(reportRangeSchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success).toBe(
			false
		);
		expect(reportRangeSchema.safeParse({ from: '2026-02-31', to: '2026-03-01' }).success).toBe(
			false
		);
		expect(reportRangeSchema.parse({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
			from: '2026-10-01',
			to: '2026-10-31'
		});
	});

	it('fills the grouping of the sales report in', () => {
		expect(salesReportSchema.parse({ from: '2026-10-01', to: '2026-10-31' })).toMatchObject({
			group: 'counterparty',
			bucket: 'month',
			counterpartyId: null
		});
		expect(
			salesReportSchema.parse({
				from: '2026-10-01',
				to: '2026-10-31',
				group: 'period',
				bucket: 'week',
				counterpartyId: '4'
			})
		).toMatchObject({ group: 'period', bucket: 'week', counterpartyId: 4 });
	});

	it('takes a transfer in whole kopecks and trims its texts', () => {
		expect(
			charityTransferSchema.parse({
				amountMinor: '150000',
				transferredOn: '2026-10-07',
				documentRef: ' ПП 15 ',
				comment: ''
			})
		).toEqual({
			amountMinor: 150000,
			transferredOn: '2026-10-07',
			documentRef: 'ПП 15',
			comment: null
		});
		expect(
			charityTransferSchema.safeParse({ amountMinor: '0', transferredOn: '2026-10-07' }).success
		).toBe(false);
		expect(
			charityTransferSchema.safeParse({ amountMinor: '10.5', transferredOn: '2026-10-07' }).success
		).toBe(false);
	});

	it('wants a reason for a reversal', () => {
		expect(charityTransferReverseSchema.safeParse({ transferId: '3', comment: '  ' }).success).toBe(
			false
		);
		expect(
			charityTransferReverseSchema.parse({ transferId: '3', comment: ' Не тот счёт ' })
		).toEqual({ transferId: 3, comment: 'Не тот счёт' });
	});
});
