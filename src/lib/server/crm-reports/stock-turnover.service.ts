import { OrgService } from '../settings/org.service';
import { ReportBaseService } from './report-base.service';
import { StockTurnoverRepository } from './stock-turnover.repository';
import { closingQty, turnoverDays } from '$lib/domain/stock/turnover';
import type { ActorContext } from '$lib/types/actor';
import type { StockTurnoverReportDto } from '$lib/types/crm-reports';
import type { StockTurnoverInput } from '$lib/validation/crm-reports';

/** The turnover sheet of the warehouse in pieces: there is no money value of a shelf (v1.51). */
export class StockTurnoverService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: StockTurnoverRepository = new StockTurnoverRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(input: StockTurnoverInput): StockTurnoverReportDto {
		const range = { from: input.from, to: input.to };
		const window = this.window(range);
		const rows = this.repo
			.rows(window, input.kind)
			// A position that neither stood on the shelf nor moved has nothing to show.
			.filter((row) => row.opening !== 0 || row.movesInWindow > 0)
			.map((row) => {
				const moves = {
					opening: row.opening,
					income: row.income,
					outcome: row.outcome,
					shipped: row.shipped
				};
				return {
					stockItemId: row.stockItemId,
					optionId: row.optionId,
					code: row.code,
					title: row.title,
					optionTitle: row.optionTitle,
					unitTitle: row.unitTitle,
					openingQty: row.opening,
					incomeQty: row.income,
					outcomeQty: row.outcome,
					closingQty: closingQty(moves),
					shippedQty: row.shipped,
					turnoverDays: turnoverDays(moves, window.days)
				};
			});
		return { range, kind: input.kind, rows };
	}
}
