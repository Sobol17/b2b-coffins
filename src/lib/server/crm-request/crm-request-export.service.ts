import ExcelJS from 'exceljs';
import { OrgService } from '../settings/org.service';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestListService } from './crm-request-list.service';
import { FLAG_TITLE, PRIORITY_TITLE, STOCK_TITLE } from '$lib/crm/requests/labels';
import type { ActorContext } from '$lib/types/actor';
import type { CrmRequestFilters, CrmRequestListItemDto } from '$lib/types/crm-request';
import type { ListQuery } from '$lib/types/list';
import { REQUEST_STATUS_META } from '$lib/ui/status';
import { formatDateTime } from '$lib/utils/format';
import { fromMinor, roundHalfUp } from '$lib/utils/money';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * The registry of the workshop as a sheet (C4). Built on the click, like the price list: the query
 * already caps the rows, and the queued `report.export` belongs to the reports of C13.
 */
export class CrmRequestExportService extends CrmRequestBaseService {
	constructor(
		ctx: ActorContext,
		private readonly list: CrmRequestListService = new CrmRequestListService(ctx),
		private readonly timeZone: string = OrgService.timezone()
	) {
		super(ctx);
	}

	async workbook(query: ListQuery<CrmRequestFilters>): Promise<Buffer> {
		const rows = this.list.exportRows(query);
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Заявки');
		const money = this.ctx.canSeePrices;
		sheet.columns = [
			{ header: 'Номер', key: 'number', width: 18 },
			{ header: 'Статус', key: 'status', width: 16 },
			{ header: 'Приоритет', key: 'priority', width: 11 },
			{ header: 'Контрагент', key: 'counterparty', width: 26 },
			{ header: 'Первая позиция', key: 'firstItem', width: 26 },
			{ header: 'Изделий', key: 'units', width: 9 },
			{ header: 'Срок доставки', key: 'deliveryAt', width: 17 },
			{ header: 'Отправлена', key: 'submittedAt', width: 17 },
			{ header: 'Исполнители', key: 'crew', width: 28 },
			{ header: 'Внимание', key: 'flags', width: 22 },
			...(money
				? [
						{ header: 'Сумма, ₽', key: 'total', width: 14, style: { numFmt: '#,##0' } },
						{ header: 'Оплачено, ₽', key: 'paid', width: 14, style: { numFmt: '#,##0' } }
					]
				: [])
		];
		sheet.getRow(1).font = { bold: true };
		for (const row of rows) sheet.addRow(this.line(row));
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}

	// The name of the deceased stays out of the file: a sheet travels further than the screen.
	private line(row: CrmRequestListItemDto): Record<string, string | number> {
		const when = (iso: string | null) => (iso === null ? '' : formatDateTime(iso, this.timeZone));
		const rubles = (minor: number | undefined) => roundHalfUp(fromMinor(minor ?? 0));
		return {
			number: row.number,
			status: REQUEST_STATUS_META[row.status].label,
			priority: PRIORITY_TITLE[row.priority],
			counterparty: row.isStockRequest ? STOCK_TITLE : (row.counterpartyName ?? ''),
			firstItem: row.firstItemTitle ?? '',
			units: row.unitCount,
			deliveryAt: when(row.deliveryAt),
			submittedAt: when(row.submittedAt),
			crew: row.assigneeNames.join(', '),
			flags: row.flags.map((flag) => FLAG_TITLE[flag]).join(', '),
			...(this.ctx.canSeePrices
				? { total: rubles(row.totalMinor), paid: rubles(row.paidMinor) }
				: {})
		};
	}
}
