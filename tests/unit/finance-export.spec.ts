import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { FinanceExportService } from '../../src/lib/server/finance/finance-export.service';
import type { FinanceOperationDto } from '../../src/lib/types/finance';

async function sheetOf(body: Buffer) {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(body as unknown as ArrayBuffer);
	const sheet = workbook.worksheets[0];
	if (!sheet) throw new Error('no sheet');
	return sheet;
}

const rows: FinanceOperationDto[] = [
	{
		key: 'manual_expense:3',
		source: 'manual_expense',
		kind: 'expense',
		occurredOn: '2026-10-20',
		signedMinor: -150_000,
		title: 'Аренда',
		detail: null,
		href: null,
		manualId: 3
	},
	{
		key: 'order_payment:9',
		source: 'order_payment',
		kind: 'income',
		occurredOn: '2026-10-19',
		signedMinor: 100_000,
		title: 'Заявка №Т-00001',
		detail: 'Наличные',
		href: '/crm/requests/1',
		manualId: null
	}
];

describe('finance sheet (C18)', () => {
	it('writes the feed with signed roubles', async () => {
		const sheet = await sheetOf(await new FinanceExportService().sheet(rows));

		expect(sheet.name).toBe('Финансы');
		expect(sheet.getRow(1).values).toEqual([
			undefined,
			'Дата',
			'Тип',
			'Источник',
			'Описание',
			'Сумма, ₽'
		]);
		expect(sheet.getRow(2).values).toEqual([
			undefined,
			'20.10.2026',
			'Расход',
			'Прочий расход',
			'Аренда',
			-1500
		]);
		expect(sheet.getRow(3).values).toEqual([
			undefined,
			'19.10.2026',
			'Доход',
			'Оплата заявки',
			'Заявка №Т-00001, Наличные',
			1000
		]);
	});
});
