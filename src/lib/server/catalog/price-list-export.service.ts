import { PriceSheetWriter } from '../crm-pricing/price-sheet-writer';
import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import { CatalogPricing } from './catalog-pricing';
import { VariantRepository } from './variant.repository';
import type { ActorContext } from '$lib/types/actor';

export interface PriceListLine {
	readonly sku: string;
	readonly productTitle: string;
	readonly categoryTitle: string | null;
	readonly priceMinor: number;
}

export const PRICE_LIST_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Personal price list of a counterparty as XLSX (P3).
 * Built on the click: exports are synchronous, there is no export job (tech.md v1.51).
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

		const models = [...new Map(rows.map((row) => [row.productId, row])).values()];
		return models.map((row) => ({
			sku: row.sku,
			productTitle: row.productTitle,
			categoryTitle: row.categoryTitle,
			priceMinor: prices?.get(row.id)?.priceMinor ?? 0
		}));
	}

	/** @throws ForbiddenError without catalog access or for a role without prices. */
	async workbook(): Promise<Buffer> {
		const lines = this.lines();
		return PriceSheetWriter.workbook(lines);
	}
}
