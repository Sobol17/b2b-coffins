import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import { seedPriceLists } from '../../scripts/seed/parties';
import { seedDicts } from '../../scripts/seed/reference';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { PriceListExportService } from '../../src/lib/server/catalog/price-list-export.service';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { counterparties, productVariants } from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);
seedCatalog(db);
const lists = seedPriceLists(db);
const [partner] = db
	.insert(counterparties)
	.values({ name: 'Партнёр', priceListId: lists.get('partner') ?? null })
	.returning()
	.all();

function actor(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId: 1,
		roles,
		scope: 'portal',
		counterpartyId: partner?.id ?? null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: false,
		requestId: 'price-list-test'
	};
}

describe('price list export (P3)', () => {
	it('lists every visible variant at the personal price of the counterparty', () => {
		const lines = new PriceListExportService(actor('cp_admin')).lines();

		expect(lines).toHaveLength(db.select().from(productVariants).all().length);
		expect(lines.find((line) => line.sku === 'MDL-201-180-PIN')).toMatchObject({
			productTitle: 'Модель «Волга»',
			categoryTitle: 'Стандарт',
			priceMinor: 830_000
		});
	});

	it('builds a workbook a spreadsheet reads back with the same rows in rubles', async () => {
		const service = new PriceListExportService(actor('cp_admin'));
		const workbook = new ExcelJS.Workbook();
		// exceljs ships its own Buffer typing, older than @types/node; the bytes are the same.
		const bytes = await service.workbook();
		await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
		const sheet = workbook.getWorksheet('Прайс-лист');

		expect(sheet?.rowCount).toBe(service.lines().length + 1);
		const row = sheet
			?.getRows(2, sheet.rowCount - 1)
			?.find((r) => r.getCell(1).value === 'MDL-201-180-PIN');
		expect(row?.getCell(7).value).toBe(8300);
	});

	it('refuses an employee: the price list is money', async () => {
		const service = new PriceListExportService(actor('cp_employee'));

		expect(() => service.lines()).toThrow(ForbiddenError);
		await expect(service.workbook()).rejects.toThrow(ForbiddenError);
	});
});
