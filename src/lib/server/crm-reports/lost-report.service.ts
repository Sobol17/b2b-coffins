import { normalizeListQuery } from '../core/list';
import { OrgService } from '../settings/org.service';
import { LostReportRepository, type LostRow } from './lost-report.repository';
import { ReportBaseService } from './report-base.service';
import type { ActorContext } from '$lib/types/actor';
import type {
	LostReasonRowDto,
	LostReportDto,
	LostRequestRowDto,
	LostStatus
} from '$lib/types/crm-reports';
import type { ListQuery } from '$lib/types/list';
import type { LostReportInput } from '$lib/validation/crm-reports';

/** Rows one sheet may hold: a workshop loses far fewer requests in a year. */
export const LOST_EXPORT_LIMIT = 10_000;
const NO_REASON = 'Без причины';

const toDto = (row: LostRow): LostRequestRowDto => ({ ...row, at: row.at.toISOString() });

/** Cancelled and rejected requests by the day they were lost (C13). */
export class LostReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: LostReportRepository = new LostReportRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(input: LostReportInput, query: ListQuery<unknown>): LostReportDto {
		const window = this.window(input);
		const grouped = this.repo.reasons(window, input.status);
		const reasons = new Map<number | null, LostReasonRowDto>();
		for (const row of grouped) {
			const seen = reasons.get(row.reasonId) ?? {
				reasonId: row.reasonId,
				title: row.title ?? NO_REASON,
				count: 0,
				totalMinor: 0
			};
			reasons.set(row.reasonId, {
				...seen,
				count: seen.count + row.count,
				totalMinor: seen.totalMinor + row.totalMinor
			});
		}
		const countOf = (status: LostStatus): number =>
			grouped.filter((row) => row.status === status).reduce((sum, row) => sum + row.count, 0);
		return {
			range: { from: input.from, to: input.to },
			status: input.status,
			cancelledCount: countOf('cancelled'),
			rejectedCount: countOf('rejected'),
			totalMinor: grouped.reduce((sum, row) => sum + row.totalMinor, 0),
			reasons: [...reasons.values()].sort((a, b) => b.count - a.count),
			page: {
				rows: this.repo.rows(window, input.status, query).map(toDto),
				total: this.repo.total(window, input.status),
				page: query.page,
				perPage: query.perPage
			}
		};
	}

	exportRows(input: LostReportInput): LostRequestRowDto[] {
		// The repository reads perPage as is: the registry clamp of 200 rows is not for a sheet.
		const query = { ...normalizeListQuery({}), perPage: LOST_EXPORT_LIMIT };
		return this.repo.rows(this.window(input), input.status, query).map(toDto);
	}
}
