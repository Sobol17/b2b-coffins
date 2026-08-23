import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../src/lib/server/db/client';
import { priceListItems, priceLists, productVariants } from '../../src/lib/server/db/schema';
import { toMinor } from '../../src/lib/utils/money';
import { readOptions, STRING_OPTION } from './args';

const optionsSchema = z.object({
	file: z.string().min(1),
	'price-list': z.string().min(1)
});

/** Sheet contents are untrusted input: every row goes through Zod before it becomes a price. */
const rowSchema = z.object({
	sku: z.string().min(1),
	price: z.coerce.number().nonnegative()
});

type PriceRow = z.infer<typeof rowSchema>;

async function readXlsx(file: string): Promise<unknown[]> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(file);
	const sheet = workbook.worksheets[0];
	if (!sheet) throw new Error(`${file} has no worksheet`);

	const header = (sheet.getRow(1).values as unknown[]).map((v) => String(v ?? '').trim());
	const rows: unknown[] = [];
	sheet.eachRow((row, index) => {
		if (index === 1) return;
		const values = row.values as unknown[];
		rows.push(Object.fromEntries(header.map((key, i) => [key, values[i]]).filter(([k]) => k)));
	});
	return rows;
}

function readCsv(file: string): unknown[] {
	const parsed = Papa.parse<Record<string, string>>(readFileSync(file, 'utf8'), {
		header: true,
		skipEmptyLines: true,
		transformHeader: (h) => h.trim()
	});
	if (parsed.errors.length > 0) {
		throw new Error(`${file}: ${parsed.errors.map((e) => e.message).join('; ')}`);
	}
	return parsed.data;
}

function parseRows(raw: unknown[]): PriceRow[] {
	const rows: PriceRow[] = [];
	const problems: string[] = [];
	raw.forEach((row, index) => {
		const parsed = rowSchema.safeParse(row);
		if (parsed.success) rows.push(parsed.data);
		else problems.push(`row ${index + 2}: ${z.prettifyError(parsed.error)}`);
	});
	if (problems.length > 0) throw new Error(problems.join('\n'));
	return rows;
}

export async function priceImport(db: Db, argv: readonly string[]): Promise<void> {
	const input = readOptions(
		argv,
		{ file: STRING_OPTION, 'price-list': STRING_OPTION },
		optionsSchema
	);

	const [list] = db
		.select({ id: priceLists.id })
		.from(priceLists)
		.where(eq(priceLists.title, input['price-list']))
		.all();
	if (!list) throw new Error(`price list "${input['price-list']}" not found`);

	const isXlsx = extname(input.file).toLowerCase() === '.xlsx';
	const rows = parseRows(isXlsx ? await readXlsx(input.file) : readCsv(input.file));

	// All or nothing: a partially applied price list would quote two customers differently.
	const applied = db.transaction((tx) => {
		let count = 0;
		for (const row of rows) {
			const [variant] = tx
				.select({ id: productVariants.id })
				.from(productVariants)
				.where(eq(productVariants.sku, row.sku))
				.all();
			if (!variant) throw new Error(`unknown variant sku ${row.sku}`);

			const priceMinor = toMinor(row.price);
			tx.insert(priceListItems)
				.values({ priceListId: list.id, variantId: variant.id, priceMinor })
				.onConflictDoUpdate({
					target: [priceListItems.priceListId, priceListItems.variantId],
					set: { priceMinor }
				})
				.run();
			count += 1;
		}
		return count;
	});

	console.log(JSON.stringify({ priceList: input['price-list'], rows: applied }));
}
