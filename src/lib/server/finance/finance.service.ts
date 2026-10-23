import { PolicyService } from '../auth/policy';
import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { OrgService } from '../settings/org.service';
import { toOperationDto } from './dto';
import { FinanceFeedRepository } from './finance-feed.repository';
import { summarize } from '$lib/domain/finance/summary';
import {
	presetRange,
	reportWindow,
	type ReportRange,
	type ReportWindow
} from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import type { FinanceOperationDto, FinancePageDto } from '$lib/types/finance';
import type { ListQuery } from '$lib/types/list';
import { isoDay } from '$lib/utils/format';
import type { FinanceFiltersInput } from '$lib/validation/finance';

/** A sheet holds the whole period; the cap only keeps a broken query from building a huge file. */
export const FINANCE_EXPORT_LIMIT = 10_000;

/**
 * The owner's money page (C18, tech.md v1.58): totals and chart of a period plus the feed under
 * them. The analytics always read the whole period; the kind and source filters narrow the feed only.
 */
export class FinanceService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly feed: FinanceFeedRepository = new FinanceFeedRepository(),
		private readonly timeZone: string = OrgService.timezone(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'finance.manage'), 'finance.manage');
	}

	today(): string {
		return isoDay(this.now().toISOString(), this.timeZone);
	}

	/** The current calendar month up to today, as the reports open. */
	defaultRange(): ReportRange {
		return presetRange('month', this.today());
	}

	page(input: FinanceFiltersInput, query: ListQuery<unknown>): FinancePageDto {
		const window = this.window(input);
		const lines = this.feed.lines(window).map((row) => ({
			source: row.source,
			occurredOn: isoDay(row.occurredAt.toISOString(), this.timeZone),
			signedMinor: row.signedMinor
		}));
		const { rows, total } = this.feed.page(window, input, query);
		return {
			filters: input,
			summary: summarize(lines, input),
			feed: {
				rows: rows.map((row) => toOperationDto(row, this.timeZone)),
				total,
				page: query.page,
				perPage: query.perPage
			}
		};
	}

	/** The feed of the period with the page filters, for the sheet. */
	feedAll(input: FinanceFiltersInput): FinanceOperationDto[] {
		return this.feed
			.page(this.window(input), input, { page: 1, perPage: FINANCE_EXPORT_LIMIT })
			.rows.map((row) => toOperationDto(row, this.timeZone));
	}

	/** @throws ValidationError for dates the calendar does not have. */
	private window(range: ReportRange): ReportWindow {
		const window = reportWindow(range, this.timeZone);
		if (window === null) throw new ValidationError('Выберите даты периода', { field: 'from' });
		return window;
	}
}
