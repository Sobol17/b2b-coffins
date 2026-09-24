import { CatalogRepository } from '../catalog/catalog.repository';
import { DeliveryAddressRepository } from '../counterparty/delivery-address.repository';
import type { Tx } from '../db/client';
import { AgencyPricing } from '../pricing/agency-pricing';
import { DraftItemRepository } from './draft-item.repository';
import { DraftDtoMapper } from './draft.dto';
import { DraftRepository, type DraftRow } from './draft.repository';
import { RequestPricer } from './request-pricer';
import { discountPercentOf } from '$lib/domain/request/pricing';
import type { ActorContext } from '$lib/types/actor';
import type { DraftDto } from '$lib/types/request';

/**
 * Prices a draft and projects it. The sums are computed and stored for every role: an employee
 * without prices still sends a request the manager has to see a total for. Only the projection
 * decides what leaves the server.
 */
export class DraftCalculator {
	constructor(
		private readonly ctx: ActorContext,
		private readonly drafts: DraftRepository = new DraftRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly addresses: DeliveryAddressRepository = new DeliveryAddressRepository(),
		private readonly catalog: CatalogRepository = new CatalogRepository(),
		private readonly agency: AgencyPricing = new AgencyPricing(ctx),
		private readonly pricer: RequestPricer = new RequestPricer(lines, drafts)
	) {}

	/** Stores line prices and request totals at the counterparty's current prices. */
	recalculate(requestId: number, tx: Tx): void {
		this.pricer.reprice(requestId, this.ctx.counterpartyId, tx);
	}

	project(draft: DraftRow): DraftDto {
		const lines = this.lines.lines(draft.id);
		const withPrices = this.ctx.canSeePrices;
		const totals = withPrices ? this.drafts.totals(draft.id) : undefined;
		return DraftDtoMapper.toDraft(draft, {
			lines,
			options: this.lines.lineOptions(lines.map((line) => line.id)),
			covers: this.catalog.mediaByProducts([...new Set(lines.map((line) => line.productId))]),
			addresses: this.addresses.listOwn(this.ctx),
			prices: withPrices ? this.lines.linePrices(lines.map((line) => line.id)) : undefined,
			agencyPrices: this.agency.forProducts(lines.map((line) => line.productId)),
			totals,
			discountPercent:
				totals === undefined
					? undefined
					: discountPercentOf(totals.itemsTotalMinor, totals.discountMinor)
		});
	}
}
