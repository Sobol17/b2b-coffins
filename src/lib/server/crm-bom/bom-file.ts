import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export const BOM_FILE_KINDS = {
	xlsx: {
		mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		extension: 'xlsx'
	},
	csv: { mime: 'text/csv', extension: 'csv' }
} as const;
export type BomFileKind = keyof typeof BOM_FILE_KINDS;

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * The kind of a norm file by its content (tech.md v1.46): a browser on Windows calls a CSV
 * `application/vnd.ms-excel`, so the declared type is not asked. Null is neither a sheet nor text.
 */
export function sniffBomFile(bytes: Buffer): BomFileKind | null {
	if (bytes.length === 0) return null;
	if (bytes.subarray(0, 4).equals(ZIP_SIGNATURE)) return 'xlsx';
	return bytes.includes(0) ? null : 'csv';
}

export function bomFileKindOf(mime: string): BomFileKind | null {
	if (mime === BOM_FILE_KINDS.xlsx.mime) return 'xlsx';
	return mime === BOM_FILE_KINDS.csv.mime ? 'csv' : null;
}

/** Excel on a Russian Windows saves CSV in Windows-1251; anything that is not UTF-8 is read so. */
function decode(bytes: Buffer): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return new TextDecoder('windows-1251').decode(bytes);
	}
}

function cellText(value: ExcelJS.CellValue, text: string): string {
	// A float from a sheet may carry noise in the last bits: 0.35 must not read as 0.35000000000000003.
	return typeof value === 'number' ? String(Number(value.toFixed(6))) : text;
}

async function readXlsx(bytes: Buffer): Promise<string[][] | null> {
	const workbook = new ExcelJS.Workbook();
	// The cast bridges the Buffer generics of Node 22 and the ones exceljs was typed against.
	await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
	const sheet = workbook.worksheets[0];
	if (!sheet) return null;
	const table: string[][] = [];
	sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
		const cells: string[] = [];
		row.eachCell({ includeEmpty: true }, (cell, column) => {
			cells[column - 1] = cellText(cell.value, cell.text);
		});
		table[rowNumber - 1] = Array.from(cells, (cell) => cell ?? '');
	});
	return Array.from(table, (cells) => cells ?? []);
}

function readCsv(bytes: Buffer): string[][] {
	const decoded = decode(bytes);
	// A byte order mark would glue itself to the first column title.
	const text = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
	const parsed = Papa.parse<string[]>(text, {
		delimitersToGuess: [';', ','],
		// Blank lines stay: the report names the row of the file, so the numbering must not shift.
		skipEmptyLines: false
	});
	return parsed.data;
}

/** The cells of a norm file as text, or null when the file does not open as its kind. */
export async function readBomTable(bytes: Buffer, kind: BomFileKind): Promise<string[][] | null> {
	try {
		return kind === 'xlsx' ? await readXlsx(bytes) : readCsv(bytes);
	} catch {
		return null;
	}
}
