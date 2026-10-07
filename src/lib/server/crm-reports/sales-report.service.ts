import { OrgService } from '../settings/org.service';
import { ReportBaseService } from './report-base.service';
import { SalesReportRepository, type SaleRow } from './sales-report.repository';
import { bucketOf, bucketsOf, type ReportRange } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import type {
	SalesBucket,
	SalesByCounterpartyRowDto,
	SalesByModelRowDto,
	SalesByPeriodRowDto,
	SalesReportDto,
	SalesTotalsDto
} from '$lib/types/crm-reports';
import { isoDay } from '$lib/utils/format';
import type { SalesReportInput } from '$lib/validation/crm-reports';

const ZERO: SalesTotalsDto = {
	requestCount: 0,
	qty: 0,
	itemsTotalMinor: 0,
	discountMinor: 0,
	totalMinor: 0,
	paidMinor: 0
};

function add(sum: SalesTotalsDto, row: SaleRow): SalesTotalsDto {
	return {
		requestCount: sum.requestCount + 1,
		qty: sum.qty + row.qty,
		itemsTotalMinor: sum.itemsTotalMinor + row.itemsTotalMinor,
		discountMinor: sum.discountMinor + row.discountMinor,
		totalMinor: sum.totalMinor + row.totalMinor,
		paidMinor: sum.paidMinor + row.paidMinor
	};
}

/** Sales by counterparty, model and period (C13). All three read one set of sold requests. */
export class SalesReportService extends ReportBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: SalesReportRepository = new SalesReportRepository(),
		timeZone: string = OrgService.timezone(),
		now: () => Date = () => new Date()
	) {
		super(ctx, timeZone, now);
	}

	report(input: SalesReportInput): SalesReportDto {
		const range = { from: input.from, to: input.to };
		const window = this.window(range);
		const sales = this.repo.sales(window, input.counterpartyId);
		const head = { range, counterpartyId: input.counterpartyId, totals: sales.reduce(add, ZERO) };
		switch (input.group) {
			case 'counterparty':
				return { ...head, group: 'counterparty', rows: this.byCounterparty(sales) };
			case 'model':
				return { ...head, group: 'model', rows: this.repo.byModel(window, input.counterpartyId) };
			case 'period':
				return {
					...head,
					group: 'period',
					bucket: input.bucket,
					rows: this.byPeriod(sales, range, input.bucket)
				};
		}
	}

	totals(range: ReportRange): SalesTotalsDto {
		return this.repo.sales(this.window(range), null).reduce(add, ZERO);
	}

	top(
		range: ReportRange,
		limit: number
	): { counterparties: SalesByCounterpartyRowDto[]; models: SalesByModelRowDto[] } {
		const window = this.window(range);
		return {
			counterparties: this.byCounterparty(this.repo.sales(window, null)).slice(0, limit),
			models: this.repo.byModel(window, null).slice(0, limit)
		};
	}

	private byCounterparty(sales: readonly SaleRow[]): SalesByCounterpartyRowDto[] {
		const rows = new Map<number, SalesByCounterpartyRowDto>();
		for (const sale of sales) {
			const seen = rows.get(sale.counterpartyId) ?? {
				...ZERO,
				counterpartyId: sale.counterpartyId,
				title: sale.counterpartyName
			};
			rows.set(sale.counterpartyId, { ...seen, ...add(seen, sale) });
		}
		return [...rows.values()].sort(
			(a, b) => b.totalMinor - a.totalMinor || a.title.localeCompare(b.title, 'ru')
		);
	}

	private byPeriod(
		sales: readonly SaleRow[],
		range: ReportRange,
		bucket: SalesBucket
	): SalesByPeriodRowDto[] {
		const sums = new Map<string, SalesTotalsDto>();
		for (const sale of sales) {
			const day = isoDay(sale.deliveredAt.toISOString(), this.timeZone);
			const key = bucketOf(day, bucket, range).from;
			sums.set(key, add(sums.get(key) ?? ZERO, sale));
		}
		return bucketsOf(range, bucket).map((b) => ({
			bucketFrom: b.from,
			bucketTo: b.to,
			...(sums.get(b.from) ?? ZERO)
		}));
	}
}
