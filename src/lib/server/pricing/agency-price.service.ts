import { PolicyService } from '../auth/policy';
import { CatalogRepository } from '../catalog/catalog.repository';
import { CatalogService } from '../catalog/catalog.service';
import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { AgencyPriceRepository } from './agency-price.repository';
import { planAgencyPrices, type AgencyPriceEntry } from '$lib/domain/pricing/agency-price';
import type { ActorContext } from '$lib/types/actor';
import type { CatalogFilters } from '$lib/types/catalog';
import type { ListQuery, Page } from '$lib/types/list';
import type { AgencyPriceFilters, AgencyPriceRowDto } from '$lib/types/pricing';
import { definedProps } from '$lib/utils/props';

export interface AgencyPriceSaveResult {
	readonly updated: number;
	readonly cleared: number;
}

/**
 * "Мои цены" (P7): the administrator of a counterparty fills the prices it shows its own client.
 * The catalog does the listing, so this service owns only the counterparty's own numbers.
 */
export class AgencyPriceService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly catalog: CatalogService = new CatalogService(ctx),
		private readonly products: CatalogRepository = new CatalogRepository(),
		private readonly repo: AgencyPriceRepository = new AgencyPriceRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError without `prices.manage` or outside the portal. */
	list(query: ListQuery<AgencyPriceFilters>): Page<AgencyPriceRowDto> {
		this.requireManager();
		const filters: CatalogFilters = definedProps({ categoryId: query.filters?.categoryId });
		const page = this.catalog.list({ ...query, filters });
		const titles = new Map(this.catalog.categories().map((row) => [row.id, row.title]));

		return {
			rows: page.rows.map((row) => ({
				productId: row.id,
				sku: row.sku,
				title: row.title,
				categoryTitle: row.categoryId === null ? null : (titles.get(row.categoryId) ?? null),
				...definedProps({
					minPurchasePriceMinor: row.minPriceMinor,
					agencyPriceMinor: row.agencyPriceMinor
				})
			})),
			total: page.total,
			page: page.page,
			perPage: page.perPage
		};
	}

	/**
	 * Writes what the submitted page actually changes. A resubmit of the same page writes nothing.
	 * @throws ForbiddenError without `prices.manage`, ValidationError for a model outside the catalog.
	 */
	save(entries: readonly AgencyPriceEntry[]): AgencyPriceSaveResult {
		const counterpartyId = this.requireManager();
		const ids = entries.map((entry) => entry.productId);
		const visible = this.products.visibleIds(ids, { publishedOnly: true });
		if (ids.some((id) => !visible.has(id))) throw new ValidationError('Неизвестная позиция');

		const plan = planAgencyPrices(entries, this.repo.pricesOf(counterpartyId, ids));
		const result = { updated: plan.upserts.length, cleared: plan.clears.length };
		if (result.updated === 0 && result.cleared === 0) return result;

		return this.audited(
			{ action: 'agency_price.set', entity: 'counterparty_product_price' },
			(tx) => {
				this.repo.upsert(counterpartyId, this.ctx.userId, plan.upserts, tx);
				this.repo.clear(counterpartyId, plan.clears, tx);
				return {
					result,
					entityId: counterpartyId,
					after: {
						updated: plan.upserts.map((row) => row.productId),
						cleared: [...plan.clears]
					}
				};
			}
		);
	}

	/** @throws ForbiddenError without the right, or for a portal actor without a counterparty. */
	private requireManager(): number {
		this.assert(PolicyService.can(this.ctx, 'prices.manage'), 'prices.manage');
		this.assert(this.ctx.counterpartyId !== null, 'prices.manage');
		return this.ctx.counterpartyId ?? 0;
	}
}
