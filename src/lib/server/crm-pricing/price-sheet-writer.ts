import { ValidationError } from '../core/errors';
import ExcelJS from 'exceljs';
import { fromMinor } from '$lib/utils/money';

export interface ModelPriceLine {
	readonly sku: string;
	readonly productTitle: string;
	readonly priceMinor: number;
}

/** One row per model; downloaded files can be uploaded unchanged. */
export class PriceSheetWriter {
	static async workbook(lines: readonly ModelPriceLine[]): Promise<Buffer> {
		if (lines.length > 5000) throw new ValidationError('Не больше 5000 моделей в прайсе');
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Прайс-лист');
		sheet.columns = [
			{ header: 'Артикул', key: 'sku', width: 22 },
			{ header: 'Модель', key: 'productTitle', width: 45 },
			{ header: 'Цена', key: 'price', width: 15, style: { numFmt: '#,##0' } }
		];
		sheet.getRow(1).font = { bold: true };
		sheet.views = [{ state: 'frozen', ySplit: 1 }];
		sheet.autoFilter = 'A1:C1';
		for (const line of lines) sheet.addRow({ ...line, price: fromMinor(line.priceMinor) });
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}
}
