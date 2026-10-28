import { CrmRequestChoicesRepository } from '../crm-request/crm-request-choices.repository';
import { OrgService } from '../settings/org.service';
import { CounterpartyReportRepository, type MarginSaleRow } from './counterparty-report.repository';
import { ReportBaseService } from './report-base.service';
import { addMargins, marginOf, ZERO_MARGIN } from '$lib/domain/report/margin';
import type { ActorContext } from '$lib/types/actor';
import type { CrmRequestChoicesDto } from '$lib/types/crm-request';
import type {
	CounterpartyMarginRowDto,
	CounterpartyReportDto,
	CounterpartyRequestRowDto,
	MarginTotalsDto
} from '$lib/types/crm-reports';
import type { CounterpartyReportInput } from '$lib/validation/crm-reports';

const ZERO: MarginTotalsDto = { ...ZERO_MARGIN, requestCount: 0, paidMinor: 0, uncostedQty: 0 };

function add(sum: MarginTotalsDto, row: MarginSaleRow): MarginTotalsDto {
	return {
		...addMargins(sum, row),
		requestCount: sum.requestCount + 1,
		paidMinor: sum.paidMinor + row.paidMinor,
		uncostedQty: sum.uncostedQty + row.uncostedQty
	};
}

function toRequest(row: MarginSaleRow & { deliveredAt: Date }): CounterpartyRequestRowDto {
	const { qty, totalMinor, costMinor, marginMinor, marginBp } = marginOf(row);
	return {
		requestId: row.id,
		number: row.number,
		status: row.status,
		deliveredAt: row.deliveredAt.toISOString(),
		qty,
		totalMinor,
		costMinor,
		marginMinor,
		marginBp,
		paidMinor: row.paidMinor,
		uncostedQty: row.uncostedQty
	};
}

/**
 * Sales by counterparty with the cost and the margin, and the requests behind one counterparty
 * (tech.md v1.63). Sold means the same as in the sales report: delivered by `delivered_at`.
 */
export class CounterpartyReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: CounterpartyReportRepository = new CounterpartyReportRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date(),
		private readonly choices: CrmRequestChoicesRepository = new CrmRequestChoicesRepository()
	) {
		super(ctx, timeZone, now);
	}

	counterparties(): CrmRequestChoicesDto['counterparties'] {
		return this.choices.counterparties();
	}

	report(input: CounterpartyReportInput): CounterpartyReportDto {
		const range = { from: input.from, to: input.to };
		const sales = this.repo
			.sales(this.window(range), input.counterpartyId)
			.flatMap((row) =>
				row.counterpartyId === null || row.deliveredAt === null
					? []
					: [{ ...row, counterpartyId: row.counterpartyId, deliveredAt: row.deliveredAt }]
			);
		return {
			range,
			counterpartyId: input.counterpartyId,
			totals: sales.reduce(add, ZERO),
			rows: this.byCounterparty(sales),
			// The newest delivery first: the owner looks for the last trips.
			requests: input.counterpartyId === null ? [] : sales.map(toRequest).reverse()
		};
	}

	private byCounterparty(
		sales: readonly (MarginSaleRow & { counterpartyId: number })[]
	): CounterpartyMarginRowDto[] {
		const rows = new Map<number, CounterpartyMarginRowDto>();
		for (const sale of sales) {
			const seen = rows.get(sale.counterpartyId) ?? {
				...ZERO,
				counterpartyId: sale.counterpartyId,
				title: sale.counterpartyName
			};
			rows.set(sale.counterpartyId, { ...seen, ...add(seen, sale) });
		}
		return [...rows.values()].sort(
			(a, b) => b.marginMinor - a.marginMinor || a.title.localeCompare(b.title, 'ru')
		);
	}
}
