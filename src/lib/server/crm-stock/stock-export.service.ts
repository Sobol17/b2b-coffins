import ExcelJS from 'exceljs';
import { OrgService } from '../settings/org.service';
import { StockBaseService } from './stock-base.service';
import { StockItemService } from './stock-item.service';
import { StockMoveService } from './stock-move.service';
import { KIND_TITLE, MOVE_TYPE_TITLE } from '$lib/crm/stock/labels';
import type { ActorContext } from '$lib/types/actor';
import type { StockFilters } from '$lib/types/crm-stock';
import type { ListQuery } from '$lib/types/list';
import { formatDateTime } from '$lib/utils/format';
import type { StockJournalFilters } from '$lib/validation/crm-stock';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * The registry and the journal of an item as sheets (C8). Built on the click, like the registry of
 * requests: the queued `report.export` belongs to the reports of C13.
 */
export class StockExportService extends StockBaseService {
	constructor(
		ctx: ActorContext,
		private readonly items: StockItemService = new StockItemService(ctx),
		private readonly moves: StockMoveService = new StockMoveService(ctx),
		private readonly timeZone: string = OrgService.timezone()
	) {
		super(ctx);
	}

	async registry(query: ListQuery<StockFilters>): Promise<Buffer> {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Склад');
		sheet.columns = [
			{ header: 'Код', key: 'code', width: 20 },
			{ header: 'Название', key: 'title', width: 36 },
			{ header: 'Вид', key: 'kind', width: 16 },
			{ header: 'Ед.', key: 'unit', width: 8 },
			{ header: 'Остаток', key: 'balance', width: 11 },
			{ header: 'Порог', key: 'threshold', width: 9 },
			{ header: 'Ниже порога', key: 'below', width: 13 },
			{ header: 'Минус', key: 'negative', width: 9 },
			{ header: 'Активна', key: 'active', width: 10 }
		];
		sheet.getRow(1).font = { bold: true };
		const yes = (value: boolean) => (value ? 'да' : '');
		for (const row of this.items.exportRows(query)) {
			sheet.addRow({
				code: row.code,
				title: row.title,
				kind: KIND_TITLE[row.kind],
				unit: row.unitTitle,
				balance: row.balance,
				threshold: row.minThreshold,
				below: yes(row.isBelowThreshold),
				negative: yes(row.isNegative),
				active: row.isActive ? 'да' : 'нет'
			});
		}
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}

	/** Every move the balance of the item is made of, newest first. */
	async journal(stockItemId: number, query: ListQuery<StockJournalFilters>): Promise<Buffer> {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Движения');
		sheet.columns = [
			{ header: 'Дата', key: 'occurredAt', width: 17 },
			{ header: 'Тип', key: 'type', width: 16 },
			{ header: 'Цвет', key: 'color', width: 16 },
			{ header: 'Количество', key: 'qty', width: 12 },
			{ header: 'Заявка', key: 'request', width: 18 },
			{ header: 'Причина', key: 'reason', width: 26 },
			{ header: 'Комментарий', key: 'comment', width: 32 },
			{ header: 'Кто', key: 'actor', width: 24 },
			{ header: 'Сторнировано', key: 'reversed', width: 14 }
		];
		sheet.getRow(1).font = { bold: true };
		for (const move of this.moves.exportRows(stockItemId, query)) {
			sheet.addRow({
				occurredAt: formatDateTime(move.occurredAt, this.timeZone),
				type: MOVE_TYPE_TITLE[move.type],
				color: move.colorTitle ?? '',
				qty: move.qty,
				request: move.requestNumber ?? '',
				reason: move.reasonTitle ?? '',
				comment: move.comment ?? '',
				actor: move.actorName ?? '',
				reversed: move.isReversed ? 'да' : ''
			});
		}
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}
}
