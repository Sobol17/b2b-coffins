import { DebtRepository } from '../counterparty/debt.repository';
import { PayrollReportService } from '../crm-payroll/payroll-report.service';
import { OrgService } from '../settings/org.service';
import { CharityReportService } from './charity-report.service';
import { DashboardRepository } from './dashboard.repository';
import { ReportBaseService } from './report-base.service';
import { SalesReportService } from './sales-report.service';
import type { ActorContext } from '$lib/types/actor';
import type { DashboardDto } from '$lib/types/crm-reports';
import { REQUEST_STATUSES } from '$lib/types/request';
import type { ReportRangeInput } from '$lib/validation/crm-reports';

const TOP = 5;

/** The owner's first screen of the reports (C13): every tile is a number of a report behind it. */
export class DashboardService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: DashboardRepository = new DashboardRepository(),
		private readonly debts: DebtRepository = new DebtRepository(),
		private readonly sales: SalesReportService = new SalesReportService(ctx),
		private readonly charity: CharityReportService = new CharityReportService(ctx),
		private readonly payroll: PayrollReportService = new PayrollReportService(ctx),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	dashboard(input: ReportRangeInput): DashboardDto {
		const range = { from: input.from, to: input.to };
		const counts = this.repo.statusCounts();
		const top = this.sales.top(range, TOP);
		const fund = this.charity.summary(range);
		// Object.fromEntries drops the keys: the cast restores what the filter above guarantees.
		const statusCounts = Object.fromEntries(
			REQUEST_STATUSES.filter((status) => status !== 'draft').map((status) => [
				status,
				counts.get(status) ?? 0
			])
		) as DashboardDto['statusCounts'];
		return {
			range,
			sales: this.sales.totals(range),
			debtMinor: this.debts.total(),
			statusCounts,
			payrollAccruedMinor: this.payroll.report(range).accruedTotalMinor,
			charityAccruedInRangeMinor: fund.accruedInRangeMinor,
			charityRemainderMinor: fund.remainderMinor,
			belowThresholdCount: this.repo.belowThresholdCount(),
			topCounterparties: top.counterparties,
			topModels: top.models
		};
	}
}
