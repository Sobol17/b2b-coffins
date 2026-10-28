import type { Tx } from '../db/client';
import { PriceRepository } from '../pricing/price.repository';
import { CounterpartyPriceRepository } from './counterparty-price.repository';
import { choosePersonalList } from '$lib/domain/pricing/personal-price';

export type FillOutcome = 'forked' | 'replaced' | 'kept';

/**
 * Puts the prices of a regional list into the list a counterparty holds alone (tech.md v1.64).
 * Without such a list it makes one; an existing one is overwritten only when asked to.
 */
export class PersonalListFiller {
	constructor(
		private readonly prices: CounterpartyPriceRepository = new CounterpartyPriceRepository(),
		private readonly lists: PriceRepository = new PriceRepository(),
		private readonly now: () => Date = () => new Date()
	) {}

	fill(
		counterparty: { id: number; name: string },
		regionId: number,
		overwrite: boolean,
		tx: Tx
	): FillOutcome {
		const own = this.lists.counterpartyList(counterparty.id);
		const choice = choosePersonalList(own, own ? this.prices.holders(own.id, tx) : 0, this.now());
		if (choice.kind === 'fork') {
			this.prices.fork(counterparty.id, `Индивидуальные цены: ${counterparty.name}`, regionId, tx);
			return 'forked';
		}
		if (!overwrite) return 'kept';
		this.prices.replace(choice.listId, regionId, tx);
		return 'replaced';
	}
}
