import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { CatalogService } from '../../src/lib/server/catalog/catalog.service';
import { CounterpartyPriceImportService } from '../../src/lib/server/crm-counterparty/counterparty-price-import.service';
import { CrmPriceExportService } from '../../src/lib/server/crm-pricing/price-export.service';
import { readPriceSheet } from '../../src/lib/server/crm-pricing/price-sheet';
import { PriceSheetWriter } from '../../src/lib/server/crm-pricing/price-sheet-writer';
import { counterparties, products, users } from '../../src/lib/server/db/schema';
import { actorOf } from './helpers/crm-counterparty';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const lists = seedPriceLists(db);
const user = db
	.insert(users)
	.values({
		email: null,
		phone: '+79990000001',
		fullName: 'Администратор',
		passwordHash: 'test',
		scope: 'crm'
	})
	.returning()
	.get()!;
const owner = actorOf('owner', user.id);
const cp = db
	.insert(counterparties)
	.values({ name: 'Личный прайс', priceListId: lists.get('partner')! })
	.returning()
	.get()!;
const other = db
	.insert(counterparties)
	.values({ name: 'Другой контрагент', priceListId: lists.get('partner')! })
	.returning()
	.get()!;
const model = db
	.select()
	.from(products)
	.all()
	.find((row) => row.sku === 'MDL-201')!;

async function sheet(rows: readonly [string, number | string][]): Promise<Uint8Array> {
	const book = new ExcelJS.Workbook();
	const page = book.addWorksheet('Прайс');
	page.addRow(['Артикул', 'Цена']);
	rows.forEach((row) => page.addRow(row));
	return new Uint8Array(await book.xlsx.writeBuffer());
}

const prices = (id: number) =>
	new CatalogService(actorOf('cp_admin', user.id, id))
		.get(model.id)
		.variants.map((row) => row.priceMinor);

describe('model price XLSX', () => {
	it('keeps kopecks when the downloaded file is uploaded unchanged', async () => {
		const bytes = await PriceSheetWriter.workbook([
			{ sku: 'MDL-201', productTitle: 'Модель', priceMinor: 12345 }
		]);
		expect(await readPriceSheet(new Uint8Array(bytes))).toEqual([
			{ sku: 'MDL-201', priceMinor: 12345 }
		]);
	});
	it('refuses an invalid file atomically', async () => {
		const before = prices(cp.id);
		await expect(
			new CounterpartyPriceImportService(owner).replaceFromSheet(
				cp.id,
				await sheet([
					['MDL-201', 12000],
					['UNKNOWN', 15000]
				])
			)
		).rejects.toThrow('Нет таких артикулов');
		expect(prices(cp.id)).toEqual(before);
		expect(
			db
				.select()
				.from(counterparties)
				.all()
				.find((row) => row.id === cp.id)?.priceListId
		).toBe(lists.get('partner'));
	});

	it('forks the private list without changing the shared region or another counterparty', async () => {
		await new CounterpartyPriceImportService(owner).replaceFromSheet(
			cp.id,
			await sheet([['MDL-201', 12000]])
		);
		expect(prices(cp.id)).toEqual([1200000, 1200000, 1200000]);
		expect(prices(other.id)).toEqual([830000, 830000, 830000]);
	});

	it('downloads an editable workbook with unique model SKUs and effective private prices', async () => {
		const bytes = await new CrmPriceExportService(owner).personal(cp.id);
		const rows = await readPriceSheet(new Uint8Array(bytes));
		expect(rows.find((row) => row.sku === 'MDL-201')?.priceMinor).toBe(1200000);
		expect(new Set(rows.map((row) => row.sku)).size).toBe(rows.length);
	});

	it('rejects empty prices and refuses roles without private-price access', async () => {
		await expect(readPriceSheet(await sheet([['MDL-201', '']]))).rejects.toThrow('нет цены');
		const worker = actorOf('carpenter', user.id);
		await expect(
			new CounterpartyPriceImportService(worker).replaceFromSheet(
				cp.id,
				await sheet([['MDL-201', 12000]])
			)
		).rejects.toThrow();
	});
});
