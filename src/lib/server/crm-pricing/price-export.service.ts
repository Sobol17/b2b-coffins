import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { CrmPricingService } from './crm-pricing.service';
import { PriceSheetWriter } from './price-sheet-writer';
import { CounterpartyPriceService } from '../crm-counterparty/counterparty-price.service';
import type { ActorContext } from '$lib/types/actor';

export class CrmPriceExportService extends BaseService {
	constructor(ctx: ActorContext) {
		super(ctx);
	}
	async list(id: number): Promise<Buffer> {
		const service = new CrmPricingService(this.ctx);
		const list = service.getPriceList(id);
		const models = new Map(service.modelChoices().map((row) => [row.id, row]));
		return PriceSheetWriter.workbook(
			list.items.flatMap((item) => {
				const model = models.get(item.productId);
				return model
					? [{ sku: model.sku, productTitle: model.productTitle, priceMinor: item.priceMinor }]
					: [];
			})
		);
	}
	async personal(id: number): Promise<Buffer> {
		const page = new CounterpartyPriceService(this.ctx).list(id, { page: 1, perPage: 5000 });
		if (page.total > 5000) throw new ValidationError('Не больше 5000 моделей в прайсе');
		const rows = page.rows;
		return PriceSheetWriter.workbook(
			rows.map((row) => ({
				sku: row.sku,
				productTitle: row.productTitle,
				priceMinor: row.personalPriceMinor ?? row.basePriceMinor
			}))
		);
	}
}
