import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedDicts } from '../../scripts/seed/reference';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { PriceImportService } from '../../src/lib/server/crm-pricing/price-import.service';
import {
	auditLog,
	priceListItems,
	priceLists,
	productVariants
} from '../../src/lib/server/db/schema';
import { actorOf, counterpartyDatabase } from './helpers/crm-counterparty';
import { insertUser } from './helpers/db';

const db = counterpartyDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const managerId = insertUser({
	email: 'manager@import.example',
	role: 'manager',
	counterpartyId: null
});
const manager = actorOf('manager', managerId);

async function sheet(
	rows: (string | number)[][],
	header = ['Артикул', 'Цена']
): Promise<Uint8Array> {
	const workbook = new ExcelJS.Workbook();
	const page = workbook.addWorksheet('Прайс');
	page.addRow(header);
	for (const row of rows) page.addRow(row);
	return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function newList(): number {
	const [list] = db
		.insert(priceLists)
		.values({ title: `Регион ${Date.now()}-${Math.random()}`, isBase: false })
		.returning()
		.all();
	if (!list) throw new Error('no list');
	return list.id;
}

function prices(listId: number): Record<string, number> {
	const rows = db
		.select({ sku: productVariants.sku, priceMinor: priceListItems.priceMinor })
		.from(priceListItems)
		.innerJoin(productVariants, eq(productVariants.id, priceListItems.variantId))
		.where(eq(priceListItems.priceListId, listId))
		.all();
	return Object.fromEntries(rows.map((row) => [row.sku, row.priceMinor]));
}

const upload = (listId: number, bytes: Uint8Array, ctx = manager) =>
	new PriceImportService(ctx).replaceFromSheet(listId, bytes);

describe('a regional price list uploaded as XLSX (v1.64)', () => {
	it('fills the list with the prices of the file, in roubles, and journals the upload', async () => {
		const id = newList();

		const count = await upload(
			id,
			await sheet([
				['MDL-201-180-PIN', 9500],
				['MDL-201-190-PIN', 9850.5]
			])
		);

		expect(count).toBe(2);
		expect(prices(id)).toEqual({ 'MDL-201-180-PIN': 950_000, 'MDL-201-190-PIN': 985_050 });
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			action: 'price_list.import',
			entityId: id,
			after: { rows: 2 }
		});
	});

	it('replaces the whole list: a price the file does not name leaves it', async () => {
		const id = newList();
		await upload(
			id,
			await sheet([
				['MDL-201-180-PIN', 9500],
				['MDL-201-190-PIN', 9800]
			])
		);

		await upload(id, await sheet([['MDL-201-180-PIN', 9600]]));

		expect(prices(id)).toEqual({ 'MDL-201-180-PIN': 960_000 });
	});

	it('takes English headers in any case', async () => {
		const id = newList();
		await upload(id, await sheet([['MDL-201-180-PIN', 9500]], ['SKU', 'Price']));
		expect(prices(id)).toEqual({ 'MDL-201-180-PIN': 950_000 });
	});

	it('refuses the whole file for an unknown SKU, a bad price or a repeated row', async () => {
		const id = newList();
		await upload(id, await sheet([['MDL-201-180-PIN', 9500]]));

		for (const rows of [
			[
				['MDL-201-180-PIN', 9600],
				['NO-SUCH', 100]
			],
			[['MDL-201-180-PIN', 'девять']],
			[['MDL-201-180-PIN', -1]],
			[
				['MDL-201-180-PIN', 9600],
				['MDL-201-180-PIN', 9700]
			]
		]) {
			await expect(upload(id, await sheet(rows))).rejects.toThrow(ValidationError);
		}
		expect(prices(id)).toEqual({ 'MDL-201-180-PIN': 950_000 });
	});

	it('refuses a file that is not XLSX and a sheet without the columns', async () => {
		const id = newList();
		await expect(upload(id, new TextEncoder().encode('sku,price\nX,1'))).rejects.toThrow(
			ValidationError
		);
		await expect(upload(id, await sheet([['X', 1]], ['Модель', 'Стоимость']))).rejects.toThrow(
			ValidationError
		);
	});

	it('is closed to roles without catalog.manage', async () => {
		const carpenter = actorOf('carpenter', managerId);
		expect(() => new PriceImportService(carpenter)).toThrow(ForbiddenError);
	});
});
