import { ValidationError } from '../core/errors';
import { PriceRepository } from '../pricing/price.repository';
import { CounterpartyBaseService } from './counterparty-base.service';
import { CounterpartyPriceRepository } from './counterparty-price.repository';
import { CrmCounterpartyRepository } from './crm-counterparty.repository';
import {
	choosePersonalList,
	planPersonalPrices,
	type PersonalPriceEntry
} from '$lib/domain/pricing/personal-price';
import { isPriceListActive } from '$lib/domain/request/pricing';
import type { ActorContext } from '$lib/types/actor';
import type {
	CounterpartyPriceFilters,
	CounterpartyPriceRowDto,
	CounterpartyPriceSaveResult
} from '$lib/types/crm-counterparty';
import type { ListQuery, Page } from '$lib/types/list';

/**
 * «Цены» tab of the counterparty card (v1.56): the workshop sets what one counterparty pays for a
 * variant. The prices live in a list this counterparty holds alone, so a shared list is copied on
 * the first change instead of moving the prices of everybody else on it.
 */
export class CounterpartyPriceService extends CounterpartyBaseService {
	constructor(
		ctx: ActorContext,
		counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository(),
		private readonly prices: CounterpartyPriceRepository = new CounterpartyPriceRepository(),
		private readonly lists: PriceRepository = new PriceRepository(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx, counterparties);
		// Every cell of the tab is a price: a price-blind role gets no tab at all.
		this.assert(ctx.canSeePrices, 'counterparty.prices');
	}

	/** @throws NotFoundError for an unknown or removed counterparty. */
	list(
		counterpartyId: number,
		query: ListQuery<CounterpartyPriceFilters>
	): Page<CounterpartyPriceRowDto> {
		this.requireCounterparty(counterpartyId);
		const { rows, total } = this.prices.variants(query);
		const ids = rows.map((row) => row.variantId);
		const at = this.now();
		const baseId = this.lists.baseLists().find((list) => isPriceListActive(list, at))?.id;
		const base =
			baseId === undefined ? new Map<number, number>() : this.lists.itemsFor(baseId, ids);
		const own = this.lists.counterpartyList(counterpartyId);
		const personal =
			own && !own.isBase && isPriceListActive(own, at)
				? this.lists.itemsFor(own.id, ids)
				: new Map<number, number>();

		return {
			rows: rows.map((row) => ({
				...row,
				basePriceMinor: base.get(row.variantId) ?? row.basePriceMinor,
				personalPriceMinor: personal.get(row.variantId) ?? null
			})),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	categories(): { id: number; title: string }[] {
		return this.prices.categories();
	}

	/**
	 * Writes what the submitted page changes. A resubmit of the same page writes nothing and makes
	 * no list.
	 * @throws NotFoundError for an unknown counterparty, ValidationError for a removed variant.
	 */
	save(
		counterpartyId: number,
		entries: readonly PersonalPriceEntry[]
	): CounterpartyPriceSaveResult {
		const counterparty = this.requireCounterparty(counterpartyId);
		const ids = entries.map((entry) => entry.variantId);
		const live = this.prices.liveVariantIds(ids);
		if (ids.some((id) => !live.has(id))) throw new ValidationError('Неизвестная позиция');

		const own = this.lists.counterpartyList(counterpartyId);
		const choice = choosePersonalList(own, own ? this.prices.holders(own.id) : 0, this.now());
		const source = choice.kind === 'reuse' ? choice.listId : choice.copyFromId;
		const stored = source === null ? new Map<number, number>() : this.prices.items(source, ids);
		const plan = planPersonalPrices(entries, stored);
		const result = { updated: plan.upserts.length, cleared: plan.clears.length };
		if (result.updated === 0 && result.cleared === 0) return result;

		return this.audited(
			{ action: 'counterparty.prices_update', entity: 'counterparties' },
			(tx) => {
				const listId =
					choice.kind === 'reuse'
						? choice.listId
						: this.prices.fork(
								counterpartyId,
								`Индивидуальные цены: ${counterparty.name}`,
								choice.copyFromId,
								tx
							);
				this.prices.upsert(listId, plan.upserts, tx);
				this.prices.clear(listId, plan.clears, tx);
				return {
					result,
					entityId: counterpartyId,
					before: { priceListId: own?.id ?? null },
					after: {
						priceListId: listId,
						updated: plan.upserts.map((row) => row.variantId),
						cleared: [...plan.clears]
					}
				};
			}
		);
	}
}
