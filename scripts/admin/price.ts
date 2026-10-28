import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import Papa from 'papaparse';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../src/lib/server/db/client';
import { readPriceSheet, type PriceSheetRow } from '../../src/lib/server/crm-pricing/price-sheet';
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

/** CSV stays a console format; XLSX goes through the parser the CRM upload uses (v1.64). */
function parseCsvRows(raw: unknown[]): PriceSheetRow[] {
	const rows: PriceSheetRow[] = [];
	const problems: string[] = [];
	raw.forEach((row, index) => {
		const parsed = rowSchema.safeParse(row);
		if (parsed.success) rows.push({ sku: parsed.data.sku, priceMinor: toMinor(parsed.data.price) });
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
	const rows = isXlsx
		? await readPriceSheet(readFileSync(input.file))
		: parseCsvRows(readCsv(input.file));

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

			const { priceMinor } = row;
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
