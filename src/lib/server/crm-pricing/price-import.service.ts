import { PolicyService } from '../auth/policy';
import { consumeRateLimit } from '../auth/rate-limit';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { ManagedPriceListRepository } from './price-list.repository';
import { readPriceSheet } from './price-sheet';
import type { ActorContext } from '$lib/types/actor';

const SHOWN_UNKNOWN = 5;

/**
 * A regional price list uploaded as XLSX from the CRM (tech.md v1.64). The file is the whole list:
 * the prices it does not name leave the list, and a bad file changes nothing.
 */
export class PriceImportService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly lists: ManagedPriceListRepository = new ManagedPriceListRepository()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'catalog.manage'), 'catalog.manage');
	}

	/**
	 * @returns how many prices the list holds now.
	 * @throws NotFoundError for an unknown list, ValidationError for a bad file or an unknown SKU.
	 */
	async replaceFromSheet(priceListId: number, bytes: Uint8Array): Promise<number> {
		if (!this.lists.find(priceListId)) throw new NotFoundError('price_list');
		consumeRateLimit('file.upload', String(this.ctx.userId));
		const rows = await readPriceSheet(bytes);
		return this.audited({ action: 'price_list.import', entity: 'price_lists' }, (tx) => {
			const ids = this.lists.variantIdsBySku(
				rows.map((row) => row.sku),
				tx
			);
			const unknown = rows.filter((row) => !ids.has(row.sku)).map((row) => row.sku);
			if (unknown.length > 0) {
				throw new ValidationError(
					`Нет таких артикулов в каталоге: ${unknown.slice(0, SHOWN_UNKNOWN).join(', ')}${unknown.length > SHOWN_UNKNOWN ? ` и ещё ${unknown.length - SHOWN_UNKNOWN}` : ''}`,
					{ field: 'file' }
				);
			}
			this.lists.replaceItems(
				priceListId,
				rows.map((row) => ({ variantId: ids.get(row.sku) ?? 0, priceMinor: row.priceMinor })),
				tx
			);
			return { result: rows.length, entityId: priceListId, after: { rows: rows.length } };
		});
	}
}
