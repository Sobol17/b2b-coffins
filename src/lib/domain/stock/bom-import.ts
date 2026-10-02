import {
	BOM_FILE_COLUMNS,
	BOM_IMPORT_MAX_ROWS,
	BOM_QTY_MAX_MILLI,
	type BomFileError,
	type BomRowError
} from '$lib/types/crm-bom';
import { parseMilli } from '$lib/utils/milli';

/** What the file is checked against: live variants by article, stock items by code. */
export interface BomLookup {
	readonly variants: ReadonlyMap<string, number>;
	readonly stockItems: ReadonlyMap<string, { readonly id: number; readonly kind: string }>;
}

export interface ParsedBomRow {
	/** Row of the file, the header is row 1. */
	readonly line: number;
	readonly variantSku: string;
	readonly componentCode: string;
	readonly qtyText: string;
	readonly variantId: number | null;
	readonly componentId: number | null;
	readonly qtyPerUnitMilli: number | null;
	readonly errors: readonly BomRowError[];
}

export interface ParsedBom {
	readonly fileError: BomFileError | null;
	readonly rows: readonly ParsedBomRow[];
	readonly errorCount: number;
}

type Table = readonly (readonly string[])[];

function failed(fileError: BomFileError): ParsedBom {
	return { fileError, rows: [], errorCount: 0 };
}

/** Index of every expected column, or null when the header misses one. Order and case are free. */
function columnIndexes(header: readonly string[]): readonly number[] | null {
	const titles = header.map((cell) => cell.trim().toLowerCase());
	const indexes = BOM_FILE_COLUMNS.map((column) => titles.indexOf(column.toLowerCase()));
	return indexes.some((index) => index < 0) ? null : indexes;
}

/** Null when the text is no norm: not a number, zero, too precise or beyond the limit. */
export function normMilli(text: string): number | null {
	const milli = parseMilli(text);
	return milli === null || milli <= 0 || milli > BOM_QTY_MAX_MILLI ? null : milli;
}

function parseRow(
	cells: readonly string[],
	line: number,
	indexes: readonly number[],
	lookup: BomLookup,
	seen: Set<string>
): ParsedBomRow {
	const [variantSku = '', componentCode = '', qtyText = ''] = indexes.map((index) =>
		(cells[index] ?? '').trim()
	);
	const variantId = lookup.variants.get(variantSku) ?? null;
	const item = lookup.stockItems.get(componentCode);
	const qtyPerUnitMilli = normMilli(qtyText);
	const errors: BomRowError[] = [];
	if (variantId === null) errors.push('unknown_variant');
	if (!item) errors.push('unknown_component');
	else if (item.kind !== 'component') errors.push('not_component');
	if (qtyPerUnitMilli === null) errors.push('bad_qty');
	// The NUL joins the pair: neither an article nor a code can hold it.
	const pair = `${variantSku}\u0000${componentCode}`;
	if (seen.has(pair)) errors.push('duplicate');
	seen.add(pair);
	return {
		line,
		variantSku,
		componentCode,
		qtyText,
		variantId,
		componentId: item?.kind === 'component' ? item.id : null,
		qtyPerUnitMilli,
		errors
	};
}

/**
 * Checks the cells of a norm file (tech.md v1.46): the first row is the header, blank rows are
 * skipped, every other row is one norm. A file error or one row error keeps the whole file out.
 */
export function parseBomTable(table: Table, lookup: BomLookup): ParsedBom {
	const [header, ...body] = table;
	if (!header) return failed('empty');
	const indexes = columnIndexes(header);
	if (!indexes) return failed('bad_header');
	const filled = body
		.map((cells, index) => ({ cells, line: index + 2 }))
		.filter(({ cells }) => cells.some((cell) => cell.trim() !== ''));
	if (filled.length === 0) return failed('empty');
	if (filled.length > BOM_IMPORT_MAX_ROWS) return failed('too_many_rows');
	const seen = new Set<string>();
	const rows = filled.map(({ cells, line }) => parseRow(cells, line, indexes, lookup, seen));
	return {
		fileError: null,
		rows,
		errorCount: rows.filter((row) => row.errors.length > 0).length
	};
}

/** Only a file without a single error becomes a version. */
export function isImportable(parsed: ParsedBom): boolean {
	return parsed.fileError === null && parsed.errorCount === 0;
}
