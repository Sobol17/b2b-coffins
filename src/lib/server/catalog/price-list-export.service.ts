import ExcelJS from 'exceljs';
import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import { CatalogPricing } from './catalog-pricing';
import { VariantRepository } from './variant.repository';
import type { ActorContext } from '$lib/types/actor';
import { fromMinor } from '$lib/utils/money';

export interface PriceListLine {
	readonly sku: string;
	readonly productTitle: string;
	readonly categoryTitle: string | null;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly lengthMm: number | null;
	readonly priceMinor: number;
}

export const PRICE_LIST_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Personal price list of a counterparty as XLSX (P3). The sheet is small and built on request:
 * the queued `report.export` job is for reports that take longer than a click.
 */
export class PriceListExportService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly variants: VariantRepository = new VariantRepository(),
		private readonly pricing: CatalogPricing = new CatalogPricing(ctx, variants)
	) {
		super(ctx);
	}

	/** @throws ForbiddenError without catalog access or for a role without prices. */
	lines(): PriceListLine[] {
		this.assert(PolicyService.can(this.ctx, 'catalog.read'), 'catalog.read');
		this.assert(this.ctx.canSeePrices, 'catalog.price_list');
		const visibility = { publishedOnly: !PolicyService.can(this.ctx, 'catalog.manage') };
		const rows = this.variants.findAllForPriceList(visibility);
		const prices = this.pricing.pricesFor(rows.map((row) => row.id));

		return rows.map((row) => ({
			sku: row.sku,
			productTitle: row.productTitle,
			categoryTitle: row.categoryTitle,
			sizeCode: row.sizeCode,
			materialTitle: row.materialTitle,
			lengthMm: row.lengthMm,
			priceMinor: prices?.get(row.id)?.priceMinor ?? 0
		}));
	}

	/** @throws ForbiddenError without catalog access or for a role without prices. */
	async workbook(): Promise<Buffer> {
		const lines = this.lines();
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Прайс-лист');
		sheet.columns = [
			{ header: 'Артикул', key: 'sku', width: 20 },
			{ header: 'Модель', key: 'productTitle', width: 28 },
			{ header: 'Группа', key: 'categoryTitle', width: 16 },
			{ header: 'Размер', key: 'sizeCode', width: 10 },
			{ header: 'Материал', key: 'materialTitle', width: 14 },
			{ header: 'Длина, мм', key: 'lengthMm', width: 12 },
			{ header: 'Цена, ₽', key: 'price', width: 14, style: { numFmt: '#,##0.00' } }
		];
		sheet.getRow(1).font = { bold: true };
		for (const line of lines) {
			// The sheet is a document for people: rubles as numbers. Kopecks stay integers in the app.
			sheet.addRow({ ...line, price: fromMinor(line.priceMinor) });
		}
		return Buffer.from(await workbook.xlsx.writeBuffer());
	}
}
