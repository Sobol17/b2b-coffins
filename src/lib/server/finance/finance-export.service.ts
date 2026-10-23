import ExcelJS from 'exceljs';
import { FINANCE_KIND_TITLE, FINANCE_SOURCE_TITLE } from '$lib/crm/finance/labels';
import type { FinanceOperationDto } from '$lib/types/finance';
import { formatDate } from '$lib/utils/format';
import { fromMinor } from '$lib/utils/money';

const MONEY = { numFmt: '#,##0.00' };

/** The feed the owner is looking at, as a sheet: one row per operation, money out below zero. */
export class FinanceExportService {
	async sheet(rows: readonly FinanceOperationDto[]): Promise<Buffer> {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Финансы');
		sheet.columns = [
			{ header: 'Дата', key: 'date', width: 12 },
			{ header: 'Тип', key: 'kind', width: 10 },
			{ header: 'Источник', key: 'source', width: 22 },
			{ header: 'Описание', key: 'title', width: 48 },
			{ header: 'Сумма, ₽', key: 'amount', width: 16, style: MONEY }
		];
		for (const row of rows) {
			sheet.addRow({
				// The day is already in org.timezone: format it as a plain calendar date.
				date: formatDate(`${row.occurredOn}T00:00:00Z`),
				kind: FINANCE_KIND_TITLE[row.kind],
				source: FINANCE_SOURCE_TITLE[row.source],
				title: row.detail === null ? row.title : `${row.title}, ${row.detail}`,
				amount: fromMinor(row.signedMinor)
			});
		}
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}
}
