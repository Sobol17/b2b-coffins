import ExcelJS from 'exceljs';
import { z } from 'zod';
import { ValidationError } from '../core/errors';
import { matchesSignature, XLSX_MIME } from '$lib/domain/files/signature';
import { toMinor } from '$lib/utils/money';

/** A regional price list of a workshop fits in far less (tech.md v1.64). */
export const PRICE_SHEET_MAX_BYTES = 2 * 1024 * 1024;
export const PRICE_SHEET_MAX_ROWS = 5000;
const PRICE_MAX_RUBLES = 1_000_000;
const SHOWN_PROBLEMS = 5;

const SKU_HEADERS = ['sku', 'артикул'];
const PRICE_HEADERS = ['price', 'цена'];

export interface PriceSheetRow {
	readonly sku: string;
	readonly priceMinor: number;
}

/** Sheet contents are untrusted input: every row goes through Zod before it becomes a price. */
const rowSchema = z.object({
	sku: z.string().trim().min(1, { error: 'нет артикула' }).max(60, { error: 'длинный артикул' }),
	price: z.coerce
		.number({ error: 'цена не число' })
		.min(0, { error: 'цена меньше нуля' })
		.max(PRICE_MAX_RUBLES, { error: 'цена больше 1 000 000 ₽' })
		.refine((value) => Number.isInteger(Math.round(value * 100 * 1e6) / 1e6), {
			error: 'цена точнее копейки'
		})
});

function cellText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'object' && 'result' in value) return cellText(value.result);
	if (typeof value === 'object' && 'text' in value) return cellText(value.text);
	return String(value).trim();
}

function columnOf(header: readonly string[], names: readonly string[]): number {
	return header.findIndex((title) => names.includes(title.toLowerCase()));
}

/**
 * Reads the first sheet: a header row with «Артикул» and «Цена» (or sku and price), then a price in
 * roubles per variant. All or nothing: one bad row refuses the whole file.
 * @throws ValidationError for a file that is not XLSX, too big, or has a bad row.
 */
export async function readPriceSheet(bytes: Uint8Array): Promise<PriceSheetRow[]> {
	if (bytes.length === 0 || bytes.length > PRICE_SHEET_MAX_BYTES) {
		throw new ValidationError('Загрузите файл XLSX не больше 2 МБ', { field: 'file' });
	}
	if (!matchesSignature(XLSX_MIME, bytes)) {
		throw new ValidationError('Загрузите файл XLSX', { field: 'file' });
	}
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(bytes.slice().buffer);
	} catch {
		throw new ValidationError('Файл не читается как XLSX', { field: 'file' });
	}
	const sheet = workbook.worksheets[0];
	// Row values are sparse (column 1 sits at index 1): Array.from fills the holes.
	const header = sheet ? Array.from(sheet.getRow(1).values as unknown[], cellText) : [];
	const skuAt = columnOf(header, SKU_HEADERS);
	const priceAt = columnOf(header, PRICE_HEADERS);
	if (!sheet || skuAt < 0 || priceAt < 0) {
		throw new ValidationError('В первой строке нужны столбцы «Артикул» и «Цена»', {
			field: 'file'
		});
	}
	if (sheet.rowCount - 1 > PRICE_SHEET_MAX_ROWS) {
		throw new ValidationError(`Не больше ${PRICE_SHEET_MAX_ROWS} строк`, { field: 'file' });
	}
	return parseRows(sheet, skuAt, priceAt);
}

function parseRows(sheet: ExcelJS.Worksheet, skuAt: number, priceAt: number): PriceSheetRow[] {
	const rows: PriceSheetRow[] = [];
	const problems: string[] = [];
	const seen = new Set<string>();
	sheet.eachRow((row, index) => {
		if (index === 1) return;
		const values = row.values as unknown[];
		const raw = { sku: cellText(values[skuAt]), price: cellText(values[priceAt]) };
		if (raw.sku === '' && raw.price === '') return;
		const parsed = rowSchema.safeParse(raw);
		if (!parsed.success) {
			problems.push(`строка ${index}: ${parsed.error.issues[0]?.message ?? 'ошибка'}`);
		} else if (seen.has(parsed.data.sku)) {
			problems.push(`строка ${index}: артикул ${parsed.data.sku} уже был`);
		} else {
			seen.add(parsed.data.sku);
			rows.push({ sku: parsed.data.sku, priceMinor: toMinor(parsed.data.price) });
		}
	});
	if (problems.length > 0) {
		throw new ValidationError(`Файл не загружен: ${problems.slice(0, SHOWN_PROBLEMS).join('; ')}`, {
			field: 'file'
		});
	}
	if (rows.length === 0) throw new ValidationError('В файле нет цен', { field: 'file' });
	return rows;
}
