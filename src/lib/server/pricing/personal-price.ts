import { PriceRepository } from './price.repository';
import { isPriceListActive, resolveUnitPrice } from '$lib/domain/request/pricing';

/**
 * Turns variant prices into the prices a counterparty pays: its own list, then the base list, then
 * the variant price (tech.md 5.5). The contract discount is not applied here; it belongs to the
 * request total (`requests.discount_minor`).
 */
export class PersonalPriceResolver {
	constructor(private readonly repo: PriceRepository = new PriceRepository()) {}

	/** @param basePrices variant id to `product_variants.base_price_minor`. */
	resolve(
		counterpartyId: number | null,
		basePrices: ReadonlyMap<number, number>,
		at: Date = new Date()
	): Map<number, number> {
		const variantIds = [...basePrices.keys()];
		const baseListId = this.repo.baseLists().find((list) => isPriceListActive(list, at))?.id;
		const own = counterpartyId === null ? undefined : this.repo.counterpartyList(counterpartyId);
		// A counterparty assigned to the base list has no overrides of its own, and an expired
		// personal list stops applying instead of quoting stale prices.
		const personalListId = own && !own.isBase && isPriceListActive(own, at) ? own.id : undefined;

		const baseList =
			baseListId === undefined ? undefined : this.repo.itemsFor(baseListId, variantIds);
		const personal =
			personalListId === undefined ? undefined : this.repo.itemsFor(personalListId, variantIds);

		return new Map(
			variantIds.map((id) => [
				id,
				resolveUnitPrice({
					basePriceMinor: basePrices.get(id) ?? 0,
					baseListPriceMinor: baseList?.get(id),
					personalListPriceMinor: personal?.get(id)
				})
			])
		);
	}
}
