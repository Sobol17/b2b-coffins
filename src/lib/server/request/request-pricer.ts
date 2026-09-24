import { VariantRepository } from '../catalog/variant.repository';
import { DiscountRuleRepository } from '../crm-pricing/discount-rule.repository';
import type { Tx } from '../db/client';
import { PersonalPriceResolver } from '../pricing/personal-price';
import { PriceRepository } from '../pricing/price.repository';
import { DraftItemRepository, type OptionDelta } from './draft-item.repository';
import { DraftRepository } from './draft.repository';
import { requestTotalsWithRules } from '$lib/domain/request/discount-rules';
import { keepDiscountShare } from '$lib/domain/request/amendment';
import { lineTotalMinor, type RequestTotals } from '$lib/domain/request/pricing';

export interface LinePrice {
	/** Personal price of the variant, without options. */
	readonly unitPriceMinor: number;
	readonly deltas: readonly OptionDelta[];
}

/**
 * Prices the lines of a request for a counterparty: the portal cart for its own, the workshop for
 * the one it picked (C4). A stock request has no counterparty and pays the base price, no discount.
 */
export class RequestPricer {
	constructor(
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly requests: DraftRepository = new DraftRepository(),
		private readonly variants: VariantRepository = new VariantRepository(),
		private readonly resolver: PersonalPriceResolver = new PersonalPriceResolver(),
		private readonly prices: PriceRepository = new PriceRepository(),
		private readonly discountRules: DiscountRuleRepository = new DiscountRuleRepository()
	) {}

	/** Stores line prices and request totals at the current prices of the counterparty. */
	reprice(requestId: number, counterpartyId: number | null, tx: Tx): void {
		const lines = this.lines.lines(requestId, tx);
		const lineOptions = this.lines.lineOptions(
			lines.map((line) => line.id),
			tx
		);
		const personal = this.personalPrices(
			counterpartyId,
			lines.map((line) => line.variantId)
		);
		const deltas = this.variants.optionDeltas([
			...new Set(lineOptions.map((option) => option.optionId))
		]);
		const paths = this.discountRules.pathsForProducts(
			lines.map((line) => line.productId),
			tx
		);

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
			return { totalMinor: total, categoryIds: paths.get(line.productId) ?? [] };
		});

		const [percent, rules] =
			counterpartyId === null
				? [0, []]
				: [
						this.prices.contractDiscount(counterpartyId),
						this.discountRules.activeFor(counterpartyId, new Date(), tx)
					];
		this.requests.saveTotals(requestId, requestTotalsWithRules(lineTotals, percent, rules), tx);
	}

	/**
	 * Totals after a change of an accepted request (tech.md v1.40): a line that had a price keeps its
	 * piece price, a line added now (still at zero, `pricesFixed` let no zero through the acceptance)
	 * takes today's price, and the discount keeps the share it had before the change.
	 */
	repriceFrozen(
		requestId: number,
		counterpartyId: number | null,
		before: RequestTotals,
		tx: Tx
	): void {
		const lines = this.lines.lines(requestId, tx);
		const prices = this.lines.linePrices(lines.map((line) => line.id));
		const options = this.lines.lineOptions(
			lines.map((line) => line.id),
			tx
		);
		let itemsTotalMinor = 0;
		for (const line of lines) {
			const stored = prices.get(line.id);
			const own = options.filter((option) => option.itemId === line.id);
			const fresh =
				stored === undefined || stored.unitPriceMinor === 0
					? this.priceLine(
							counterpartyId,
							line.variantId,
							own.map((option) => option.optionId)
						)
					: undefined;
			const unitPriceMinor = fresh?.unitPriceMinor ?? stored?.unitPriceMinor ?? 0;
			const deltas = fresh?.deltas.map((delta) => delta.priceDeltaMinor) ?? [
				stored?.optionsMinor ?? 0
			];
			const total = lineTotalMinor({ unitPriceMinor, optionDeltasMinor: deltas, qty: line.qty });
			this.lines.savePrices(
				line.id,
				{ unitPriceMinor, lineTotalMinor: total },
				fresh?.deltas ?? [],
				tx
			);
			itemsTotalMinor += total;
		}
		this.requests.saveTotals(requestId, keepDiscountShare(before, itemsTotalMinor), tx);
	}

	/** Today's price of one line, for a line added to a request whose other prices are frozen. */
	priceLine(
		counterpartyId: number | null,
		variantId: number,
		optionIds: readonly number[]
	): LinePrice {
		const deltas = this.variants.optionDeltas([...optionIds]);
		return {
			unitPriceMinor: this.personalPrices(counterpartyId, [variantId]).get(variantId) ?? 0,
			deltas: optionIds.map((optionId) => ({
				optionId,
				priceDeltaMinor: deltas.get(optionId) ?? 0
			}))
		};
	}

	private personalPrices(counterpartyId: number | null, variantIds: readonly number[]) {
		const stored = this.variants.findPrices([...new Set(variantIds)], false);
		return this.resolver.resolve(
			counterpartyId,
			new Map([...stored].map(([id, row]) => [id, row.basePriceMinor]))
		);
	}
}
