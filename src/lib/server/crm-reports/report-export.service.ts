import ExcelJS from 'exceljs';
import { FUNNEL_STAGE_TITLE, LOST_STATUS_TITLE } from '$lib/crm/reports/labels';
import type {
	CharityReportDto,
	FunnelReportDto,
	LostReportDto,
	LostRequestRowDto,
	SalesReportDto,
	SalesTotalsDto,
	StockTurnoverReportDto
} from '$lib/types/crm-reports';
import { formatDateTime } from '$lib/utils/format';
import { fromMinor } from '$lib/utils/money';

const MONEY = { numFmt: '#,##0.00' };
type Column = { header: string; key: string; width: number; style?: typeof MONEY };
type Cells = Record<string, unknown>;

const col = (header: string, key: string, width: number, style?: typeof MONEY): Column =>
	style ? { header, key, width, style } : { header, key, width };

const totalsCells = (t: SalesTotalsDto): Cells => ({
	requests: t.requestCount,
	qty: t.qty,
	items: fromMinor(t.itemsTotalMinor),
	discount: fromMinor(t.discountMinor),
	total: fromMinor(t.totalMinor),
	paid: fromMinor(t.paidMinor)
});
const TOTALS_COLUMNS: Column[] = [
	col('Заявок', 'requests', 9),
	col('Штук', 'qty', 8),
	col('Сумма, ₽', 'items', 16, MONEY),
	col('Скидка, ₽', 'discount', 14, MONEY),
	col('Итог, ₽', 'total', 16, MONEY),
	col('Оплачено, ₽', 'paid', 16, MONEY)
];
const MODEL_COLUMNS: Column[] = [
	col('Модель', 'name', 36),
	col('Заявок', 'requests', 9),
	col('Штук', 'qty', 8),
	col('Сумма до скидки, ₽', 'items', 20, MONEY)
];
const STOCK_COLUMNS: Column[] = [
	col('Код', 'code', 20),
	col('Позиция', 'title', 36),
	col('Цвет', 'color', 16),
	col('Ед.', 'unit', 8),
	col('Начало', 'opening', 10),
	col('Приход', 'income', 10),
	col('Расход', 'outcome', 10),
	col('Конец', 'closing', 10),
	col('Отгружено', 'shipped', 12),
	col('Дни запаса', 'days', 12)
];
const FUNNEL_COLUMNS: Column[] = [
	col('Стадия', 'stage', 24),
	col('Заявок', 'count', 10),
	col('От предыдущей, %', 'previous', 18),
	col('От отправленных, %', 'first', 20)
];
const LOST_COLUMNS: Column[] = [
	col('Дата', 'at', 17),
	col('Заявка', 'number', 16),
	col('Статус', 'status', 12),
	col('Контрагент', 'cp', 32),
	col('Причина', 'reason', 26),
	col('Комментарий', 'comment', 36),
	col('Сумма, ₽', 'total', 16, MONEY)
];
const CHARITY_COLUMNS: Column[] = [
	col('Дата', 'date', 14),
	col('Сумма, ₽', 'amount', 16, MONEY),
	col('Документ', 'document', 22),
	col('Комментарий', 'comment', 36),
	col('Кто записал', 'author', 26),
	col('Сторно', 'reversal', 10)
];

const percent = (bp: number | null): number | string => (bp === null ? '' : bp / 100);

/**
 * Sheets of the reports (C13). Each one is built on the click from the DTO the screen shows, so
 * the file and the screen cannot disagree. The caller has already checked `reports.read`.
 */
export class ReportExportService {
	constructor(private readonly timeZone: string) {}

	private async build(
		title: string,
		columns: Column[],
		rows: readonly Cells[],
		total?: Cells
	): Promise<Buffer> {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet(title);
		sheet.columns = columns;
		sheet.getRow(1).font = { bold: true };
		for (const row of rows) sheet.addRow(row);
		if (total) sheet.addRow(total).font = { bold: true };
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}

	sales(dto: SalesReportDto): Promise<Buffer> {
		const total = { name: 'Итого', ...totalsCells(dto.totals) };
		switch (dto.group) {
			case 'counterparty':
				return this.build(
					'Продажи',
					[col('Контрагент', 'name', 36), ...TOTALS_COLUMNS],
					dto.rows.map((row) => ({ name: row.title, ...totalsCells(row) })),
					total
				);
			case 'period':
				return this.build(
					'Продажи',
					[col('Период', 'name', 26), ...TOTALS_COLUMNS],
					dto.rows.map((row) => ({
						name: `${row.bucketFrom} – ${row.bucketTo}`,
						...totalsCells(row)
					})),
					total
				);
			case 'model':
				return this.build(
					'Продажи',
					MODEL_COLUMNS,
					dto.rows.map((row) => ({
						name: row.title,
						requests: row.requestCount,
						qty: row.qty,
						items: fromMinor(row.linesTotalMinor)
					})),
					{ name: 'Итого', qty: dto.totals.qty, items: fromMinor(dto.totals.itemsTotalMinor) }
				);
		}
	}

	stock(dto: StockTurnoverReportDto): Promise<Buffer> {
		return this.build(
			'Оборачиваемость',
			STOCK_COLUMNS,
			dto.rows.map((row) => ({
				code: row.code,
				title: row.title,
				color: row.optionTitle ?? '',
				unit: row.unitTitle,
				opening: row.openingQty,
				income: row.incomeQty,
				outcome: row.outcomeQty,
				closing: row.closingQty,
				shipped: row.shippedQty,
				days: row.turnoverDays ?? ''
			}))
		);
	}

	funnel(dto: FunnelReportDto): Promise<Buffer> {
		return this.build('Воронка', FUNNEL_COLUMNS, [
			...dto.stages.map((stage) => ({
				stage: FUNNEL_STAGE_TITLE[stage.stage],
				count: stage.count,
				previous: percent(stage.shareOfPreviousBp),
				first: percent(stage.shareOfFirstBp)
			})),
			{ stage: LOST_STATUS_TITLE.cancelled, count: dto.cancelledCount },
			{ stage: LOST_STATUS_TITLE.rejected, count: dto.rejectedCount }
		]);
	}

	lost(dto: LostReportDto, rows: readonly LostRequestRowDto[]): Promise<Buffer> {
		return this.build(
			'Потерянные заявки',
			LOST_COLUMNS,
			rows.map((row) => ({
				at: formatDateTime(row.at, this.timeZone),
				number: row.number,
				status: LOST_STATUS_TITLE[row.status],
				cp: row.counterpartyTitle ?? '',
				reason: row.reasonTitle ?? '',
				comment: row.comment ?? '',
				total: fromMinor(row.totalMinor)
			})),
			{ at: 'Итого', total: fromMinor(dto.totalMinor) }
		);
	}

	charity(dto: CharityReportDto): Promise<Buffer> {
		const state = (row: CharityReportDto['transfers']['rows'][number]): string => {
			if (row.reversalOfId !== null) return 'сторно';
			return row.isReversed ? 'сторнировано' : '';
		};
		return this.build(
			'Фонд',
			CHARITY_COLUMNS,
			dto.transfers.rows.map((row) => ({
				date: row.transferredOn,
				amount: fromMinor(row.amountMinor),
				document: row.documentRef ?? '',
				comment: row.comment ?? '',
				author: row.createdByName,
				reversal: state(row)
			})),
			{ date: 'Остаток', amount: fromMinor(dto.remainderMinor) }
		);
	}
}
