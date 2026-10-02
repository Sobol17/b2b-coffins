import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	isImportable,
	normMilli,
	parseBomTable,
	type BomLookup
} from '../../src/lib/domain/stock/bom-import';
import {
	BOM_FILE_COLUMNS,
	BOM_IMPORT_MAX_ROWS,
	BOM_QTY_MAX_MILLI
} from '../../src/lib/types/crm-bom';
import { formatMilli, parseMilli } from '../../src/lib/utils/milli';

function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const HEADER = [...BOM_FILE_COLUMNS];
const lookup: BomLookup = {
	variants: new Map([
		['V-180', 1],
		['V-200', 2]
	]),
	stockItems: new Map([
		['CMP-BOARD', { id: 10, kind: 'component' }],
		['CMP-LACQUER', { id: 11, kind: 'component' }],
		['PRD-SHELF', { id: 20, kind: 'product' }]
	])
};

describe('a norm in the file (C9)', () => {
	it('reads a comma and a point alike', () => {
		expect(normMilli('0,35')).toBe(350);
		expect(normMilli('0.35')).toBe(350);
		expect(normMilli('2')).toBe(2000);
		expect(normMilli(' 1 250,5 ')).toBe(1_250_500);
	});

	it.each(['', 'abc', '0', '0,000', '-1', '0,3505', '1e3', '1,2,3'])('refuses %j', (text) => {
		expect(normMilli(text)).toBeNull();
	});

	it('refuses a norm above the limit', () => {
		expect(normMilli(formatMilli(BOM_QTY_MAX_MILLI))).toBe(BOM_QTY_MAX_MILLI);
		expect(normMilli(formatMilli(BOM_QTY_MAX_MILLI + 1))).toBeNull();
	});

	it('survives the round trip through its text', () => {
		assertProperty(
			fc.property(fc.integer({ min: 0, max: BOM_QTY_MAX_MILLI }), (milli) => {
				expect(parseMilli(formatMilli(milli))).toBe(milli);
			})
		);
	});
});

describe('the file of norms (C9 DoD)', () => {
	it('turns a clean file into norms', () => {
		const parsed = parseBomTable(
			[HEADER, ['V-180', 'CMP-BOARD', '2,4'], ['V-180', 'CMP-LACQUER', '0.35']],
			lookup
		);
		expect(isImportable(parsed)).toBe(true);
		expect(parsed.rows).toEqual([
			expect.objectContaining({ line: 2, variantId: 1, componentId: 10, qtyPerUnitMilli: 2400 }),
			expect.objectContaining({ line: 3, variantId: 1, componentId: 11, qtyPerUnitMilli: 350 })
		]);
	});

	it('finds the columns in any order and case and ignores the extra ones', () => {
		const parsed = parseBomTable(
			[
				['норма на единицу', 'Примечание', ' КОД КОМПЛЕКТУЮЩЕГО ', 'Артикул варианта'],
				['1', 'лак', 'CMP-LACQUER', 'V-200']
			],
			lookup
		);
		expect(parsed.rows[0]).toMatchObject({ variantId: 2, componentId: 11, qtyPerUnitMilli: 1000 });
	});

	it('skips blank rows and keeps the line numbers of the file', () => {
		const parsed = parseBomTable(
			[HEADER, ['', ' ', ''], ['V-180', 'CMP-BOARD', '1'], [], ['V-200', 'CMP-BOARD', '1']],
			lookup
		);
		expect(parsed.rows.map((row) => row.line)).toEqual([3, 5]);
	});

	it('reports every error of a row', () => {
		const parsed = parseBomTable(
			[
				HEADER,
				['V-999', 'CMP-NONE', 'много'],
				['V-180', 'PRD-SHELF', '1'],
				['V-180', 'CMP-BOARD', '1'],
				['V-180', 'CMP-BOARD', '2']
			],
			lookup
		);
		expect(parsed.rows.map((row) => row.errors)).toEqual([
			['unknown_variant', 'unknown_component', 'bad_qty'],
			['not_component'],
			[],
			['duplicate']
		]);
		expect(parsed.errorCount).toBe(3);
		expect(isImportable(parsed)).toBe(false);
	});

	it('names the file error', () => {
		expect(parseBomTable([], lookup).fileError).toBe('empty');
		expect(parseBomTable([HEADER], lookup).fileError).toBe('empty');
		expect(parseBomTable([HEADER, ['', '']], lookup).fileError).toBe('empty');
		expect(parseBomTable([['Артикул', 'Код', 'Норма']], lookup).fileError).toBe('bad_header');
		const tooMany = Array.from({ length: BOM_IMPORT_MAX_ROWS + 1 }, () => [
			'V-180',
			'CMP-BOARD',
			'1'
		]);
		expect(parseBomTable([HEADER, ...tooMany], lookup).fileError).toBe('too_many_rows');
		expect(isImportable(parseBomTable([], lookup))).toBe(false);
	});

	it('lets a file through only when every row resolved', () => {
		const cell = fc.constantFrom(
			'V-180',
			'V-200',
			'V-999',
			'CMP-BOARD',
			'PRD-SHELF',
			'1',
			'0',
			'x',
			''
		);
		assertProperty(
			fc.property(fc.array(fc.tuple(cell, cell, cell), { maxLength: 12 }), (body) => {
				const parsed = parseBomTable([HEADER, ...body], lookup);
				if (!isImportable(parsed)) {
					expect(parsed.fileError ?? parsed.errorCount).toBeTruthy();
					return;
				}
				const pairs = new Set<string>();
				for (const row of parsed.rows) {
					expect(row.variantId).not.toBeNull();
					expect(row.componentId).not.toBeNull();
					expect(row.qtyPerUnitMilli).toBeGreaterThan(0);
					pairs.add(`${row.variantId}:${row.componentId}`);
				}
				expect(pairs.size).toBe(parsed.rows.length);
			})
		);
	});
});
