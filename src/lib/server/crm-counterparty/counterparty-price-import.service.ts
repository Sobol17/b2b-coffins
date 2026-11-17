import { BaseService } from '../core/service';
import { consumeRateLimit } from '../auth/rate-limit';
import { ValidationError } from '../core/errors';
import { readPriceSheet } from '../crm-pricing/price-sheet';
import { ManagedPriceListRepository } from '../crm-pricing/price-list.repository';
import { CounterpartyPriceService } from './counterparty-price.service';
import type { ActorContext } from '$lib/types/actor';

/** Replace only this counterparty's private prices; a shared regional list is never written. */
export class CounterpartyPriceImportService extends BaseService {
	constructor(ctx: ActorContext) {
		super(ctx);
	}
	async replaceFromSheet(id: number, bytes: Uint8Array): Promise<number> {
		const service = new CounterpartyPriceService(this.ctx);
		consumeRateLimit('file.upload', String(this.ctx.userId));
		const rows = await readPriceSheet(bytes);
		const models = new Map(
			new ManagedPriceListRepository().modelChoices().map((row) => [row.sku, row.id])
		);
		const unknown = rows.filter((row) => !models.has(row.sku));
		if (unknown.length)
			throw new ValidationError(
				`Нет таких артикулов моделей: ${unknown
					.slice(0, 5)
					.map((row) => row.sku)
					.join(', ')}`,
				{ field: 'file' }
			);
		const entries = rows.map((row) => ({
			productId: models.get(row.sku)!,
			priceMinor: row.priceMinor
		}));
		service.save(id, entries, true);
		return rows.length;
	}
}
