import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ReportExportService } from '../../src/lib/server/crm-reports/report-export.service';
import type { SalesReportDto, StockTurnoverReportDto } from '../../src/lib/types/crm-reports';

async function sheetOf(body: Buffer) {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(body as unknown as ArrayBuffer);
	const sheet = workbook.worksheets[0];
	if (!sheet) throw new Error('no sheet');
	return sheet;
}
const range = { from: '2026-10-01', to: '2026-10-31' };
const totals = {
	requestCount: 2,
	qty: 3,
	itemsTotalMinor: 300_000,
	discountMinor: 30_000,
	totalMinor: 270_000,
	paidMinor: 100_000
};

describe('report sheets (C13)', () => {
	it('writes sales in roubles with a total row', async () => {
		const dto: SalesReportDto = {
			range,
			counterpartyId: null,
			totals,
			group: 'counterparty',
			rows: [{ ...totals, counterpartyId: 1, title: 'Ритуал-Сервис' }]
		};
		const sheet = await sheetOf(await new ReportExportService('Europe/Moscow').sales(dto));
		expect(sheet.getRow(1).values).toEqual(
			expect.arrayContaining(['Контрагент', 'Заявок', 'Итог, ₽', 'Оплачено, ₽'])
		);
		expect(sheet.getRow(2).values).toEqual(
			expect.arrayContaining(['Ритуал-Сервис', 2, 2700, 1000])
		);
		expect(sheet.getRow(3).getCell(1).value).toBe('Итого');
	});

	it('leaves the days of stock empty when nothing was shipped', async () => {
		const dto: StockTurnoverReportDto = {
			range,
			kind: null,
			rows: [
				{
					stockItemId: 1,
					optionId: 2,
					code: 'ST-1',
					title: 'Волга',
					optionTitle: 'Орех',
					unitTitle: 'шт',
					openingQty: 4,
					incomeQty: 0,
					outcomeQty: 0,
					closingQty: 4,
					shippedQty: 0,
					turnoverDays: null
				}
			]
		};
		const sheet = await sheetOf(await new ReportExportService('Europe/Moscow').stock(dto));
		expect(sheet.getRow(2).values).toEqual(expect.arrayContaining(['ST-1', 'Волга', 'Орех', 4]));
		expect(sheet.getRow(2).getCell(10).value ?? '').toBe('');
	});
});
