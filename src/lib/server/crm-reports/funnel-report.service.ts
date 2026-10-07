import { OrgService } from '../settings/org.service';
import { FunnelReportRepository } from './funnel-report.repository';
import { ReportBaseService } from './report-base.service';
import { funnelShares } from '$lib/domain/report/funnel';
import type { ActorContext } from '$lib/types/actor';
import { FUNNEL_STAGES, type FunnelReportDto } from '$lib/types/crm-reports';
import type { ReportRangeInput } from '$lib/validation/crm-reports';

/** How far the requests sent in a period got (C13): a cohort, not a cut by transition dates. */
export class FunnelReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: FunnelReportRepository = new FunnelReportRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(range: ReportRangeInput): FunnelReportDto {
		const counts = this.repo.counts(this.window(range));
		const shares = funnelShares(FUNNEL_STAGES.map((stage) => counts[stage]));
		return {
			range: { from: range.from, to: range.to },
			stages: FUNNEL_STAGES.map((stage, index) => ({
				stage,
				count: counts[stage],
				shareOfPreviousBp: shares[index]?.shareOfPreviousBp ?? null,
				shareOfFirstBp: shares[index]?.shareOfFirstBp ?? null
			})),
			cancelledCount: counts.cancelled,
			rejectedCount: counts.rejected
		};
	}
}
