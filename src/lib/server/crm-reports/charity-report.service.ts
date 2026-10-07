import { PolicyService } from '../auth/policy';
import { CharityRepository } from '../charity/charity.repository';
import { OrgService } from '../settings/org.service';
import { CharityTransferRepository, type TransferRow } from './charity-transfer.repository';
import { ReportBaseService } from './report-base.service';
import { fundRemainderMinor } from '$lib/domain/charity/balance';
import { countsTowardFund, tallyCharity, type DeliveredCharityRow } from '$lib/domain/charity/rate';
import type { ReportRange, ReportWindow } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import type {
	CharityAccrualRowDto,
	CharityReportDto,
	CharityTransferDto
} from '$lib/types/crm-reports';
import type { ListQuery } from '$lib/types/list';
import { isoDay } from '$lib/utils/format';

const ALL = { kind: 'all' } as const;

/**
 * What the workshop owes the fund (C13). The accrued total is counted by the code that rebuilds
 * the banner, so the two numbers cannot drift apart.
 */
export class CharityReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly accrued: CharityRepository = new CharityRepository(),
		private readonly transfers: CharityTransferRepository = new CharityTransferRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(range: ReportRange, query: ListQuery<unknown>): CharityReportDto {
		const window = this.window(range);
		const rows = this.accrued.frozenRows(ALL);
		const accruedAllMinor = tallyCharity(rows, ALL, this.timeZone).amountMinor;
		const sent = this.transfers.amounts();
		const accruals = this.accruals(rows, window);
		const page = this.transfers.page(window, query);
		return {
			range: { from: range.from, to: range.to },
			accruedAllMinor,
			transferredAllMinor: sent.reduce((sum, amount) => sum + amount, 0),
			remainderMinor: fundRemainderMinor(accruedAllMinor, sent),
			accruedInRangeMinor: accruals.reduce((sum, row) => sum + row.amountMinor, 0),
			transferredInRangeMinor: this.transfers.sumWithin(window),
			accruals,
			transfers: {
				rows: page.rows.map((row) => this.toDto(row)),
				total: page.total,
				page: query.page,
				perPage: query.perPage
			},
			canManage: PolicyService.can(this.ctx, 'charity.manage')
		};
	}

	summary(range: ReportRange): { accruedInRangeMinor: number; remainderMinor: number } {
		const rows = this.accrued.frozenRows(ALL);
		const accruedAll = tallyCharity(rows, ALL, this.timeZone).amountMinor;
		return {
			accruedInRangeMinor: this.accruals(rows, this.window(range)).reduce(
				(sum, row) => sum + row.amountMinor,
				0
			),
			remainderMinor: fundRemainderMinor(accruedAll, this.transfers.amounts())
		};
	}

	private accruals(
		rows: readonly DeliveredCharityRow[],
		window: ReportWindow
	): CharityAccrualRowDto[] {
		const sums = new Map<number, { requestCount: number; amountMinor: number }>();
		for (const row of rows) {
			const at = row.deliveredAt?.getTime();
			if (!countsTowardFund(row) || row.counterpartyId === null || at === undefined) continue;
			if (at < window.from.getTime() || at >= window.to.getTime()) continue;
			const seen = sums.get(row.counterpartyId) ?? { requestCount: 0, amountMinor: 0 };
			sums.set(row.counterpartyId, {
				requestCount: seen.requestCount + 1,
				amountMinor: seen.amountMinor + (row.charityAmountMinor ?? 0)
			});
		}
		const names = this.transfers.counterpartyNames([...sums.keys()]);
		return [...sums.entries()]
			.map(([counterpartyId, sum]) => ({
				counterpartyId,
				title: names.get(counterpartyId) ?? '',
				...sum
			}))
			.sort((a, b) => b.amountMinor - a.amountMinor);
	}

	private toDto(row: TransferRow): CharityTransferDto {
		const { transferredAt, createdAt, ...rest } = row;
		return {
			...rest,
			transferredOn: isoDay(transferredAt.toISOString(), this.timeZone),
			createdAt: createdAt.toISOString()
		};
	}
}
