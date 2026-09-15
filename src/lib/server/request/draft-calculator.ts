import { CatalogRepository } from '../catalog/catalog.repository';
import { VariantRepository } from '../catalog/variant.repository';
import { CounterpartyRepository } from '../counterparty/counterparty.repository';
import { DeliveryAddressRepository } from '../counterparty/delivery-address.repository';
import type { Tx } from '../db/client';
import { PersonalPriceResolver } from '../pricing/personal-price';
import { DraftItemRepository } from './draft-item.repository';
import { DraftDtoMapper } from './draft.dto';
import { DraftRepository, type DraftRow } from './draft.repository';
import { lineTotalMinor, requestTotals } from '$lib/domain/request/pricing';
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
		private readonly variants: VariantRepository = new VariantRepository(),
		private readonly resolver: PersonalPriceResolver = new PersonalPriceResolver(),
		private readonly counterparties: CounterpartyRepository = new CounterpartyRepository(),
		private readonly addresses: DeliveryAddressRepository = new DeliveryAddressRepository(),
		private readonly catalog: CatalogRepository = new CatalogRepository()
	) {}

	/** Stores line prices and request totals at the counterparty's current prices. */
	recalculate(requestId: number, tx: Tx): void {
		const lines = this.lines.lines(requestId, tx);
		const lineOptions = this.lines.lineOptions(
			lines.map((line) => line.id),
			tx
		);
		const stored = this.variants.findPrices(
			[...new Set(lines.map((line) => line.variantId))],
			false
		);
		const personal = this.resolver.resolve(
			this.ctx.counterpartyId,
			new Map([...stored].map(([id, row]) => [id, row.basePriceMinor]))
		);
		const deltas = this.variants.optionDeltas([
			...new Set(lineOptions.map((option) => option.optionId))
		]);

		const lineTotals = lines.map((line) => {
			const own = lineOptions
				.filter((option) => option.itemId === line.id)
				.map((option) => ({
					optionId: option.optionId,
					priceDeltaMinor: deltas.get(option.optionId) ?? 0
				}));
			const unitPriceMinor = personal.get(line.variantId) ?? 0;
			const total = lineTotalMinor({
				unitPriceMinor,
				optionDeltasMinor: own.map((option) => option.priceDeltaMinor),
				qty: line.qty
			});
			this.lines.savePrices(line.id, { unitPriceMinor, lineTotalMinor: total }, own, tx);
			return total;
		});

		const discountPercent = this.counterparties.findOwn(this.ctx)?.discountPercent ?? 0;
		this.drafts.saveTotals(requestId, requestTotals(lineTotals, discountPercent), tx);
	}

	project(draft: DraftRow): DraftDto {
		const lines = this.lines.lines(draft.id);
		const withPrices = this.ctx.canSeePrices;
		return DraftDtoMapper.toDraft(draft, {
			lines,
			options: this.lines.lineOptions(lines.map((line) => line.id)),
			covers: this.catalog.mediaByProducts([...new Set(lines.map((line) => line.productId))]),
			addresses: this.addresses.listOwn(this.ctx),
			prices: withPrices ? this.lines.linePrices(lines.map((line) => line.id)) : undefined,
			totals: withPrices ? this.drafts.totals(draft.id) : undefined,
			discountPercent: withPrices
				? this.counterparties.findOwn(this.ctx)?.discountPercent
				: undefined
		});
	}
}
