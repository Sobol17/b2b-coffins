import ExcelJS from 'exceljs';
import { REQUEST_STATUS_META } from '$lib/ui/status';
import type { CounterpartyReportDto, MarginTotalsDto } from '$lib/types/crm-reports';
import { formatDateTime } from '$lib/utils/format';
import { fromMinor } from '$lib/utils/money';

const MONEY = { numFmt: '#,##0.00' };
const PERCENT = { numFmt: '0.0' };

const MARGIN_COLUMNS = [
	{ header: 'Штук', key: 'qty', width: 8 },
	{ header: 'Сумма, ₽', key: 'total', width: 16, style: MONEY },
	{ header: 'Себестоимость, ₽', key: 'cost', width: 18, style: MONEY },
	{ header: 'Маржа, ₽', key: 'margin', width: 16, style: MONEY },
	{ header: 'Маржа, %', key: 'share', width: 10, style: PERCENT },
	{ header: 'Оплачено, ₽', key: 'paid', width: 16, style: MONEY },
	{ header: 'Без себестоимости, шт.', key: 'uncosted', width: 22 }
];

const cells = (row: Omit<MarginTotalsDto, 'requestCount'>) => ({
	qty: row.qty,
	total: fromMinor(row.totalMinor),
	cost: fromMinor(row.costMinor),
	margin: fromMinor(row.marginMinor),
	share: row.marginBp === null ? null : row.marginBp / 100,
	paid: fromMinor(row.paidMinor),
	uncosted: row.uncostedQty
});

/** The counterparty margin report as a workbook: the summary, and the requests when one is chosen. */
export async function marginWorkbook(
	dto: CounterpartyReportDto,
	timeZone: string
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	const summary = workbook.addWorksheet('По контрагентам');
	summary.columns = [
		{ header: 'Контрагент', key: 'name', width: 36 },
		{ header: 'Заявок', key: 'requests', width: 9 },
		...MARGIN_COLUMNS
	];
	summary.getRow(1).font = { bold: true };
	for (const row of dto.rows) {
		summary.addRow({ name: row.title, requests: row.requestCount, ...cells(row) });
	}
	summary.addRow({ name: 'Итого', requests: dto.totals.requestCount, ...cells(dto.totals) }).font =
		{
			bold: true
		};

	if (dto.requests.length > 0) {
		const detail = workbook.addWorksheet('Заявки');
		detail.columns = [
			{ header: 'Номер', key: 'number', width: 16 },
			{ header: 'Доставлена', key: 'at', width: 18 },
			{ header: 'Статус', key: 'status', width: 16 },
			...MARGIN_COLUMNS
		];
		detail.getRow(1).font = { bold: true };
		for (const row of dto.requests) {
			detail.addRow({
				number: row.number,
				at: formatDateTime(row.deliveredAt, timeZone),
				status: REQUEST_STATUS_META[row.status].label,
				...cells(row)
			});
		}
	}
	return Buffer.from(await workbook.xlsx.writeBuffer());
}
