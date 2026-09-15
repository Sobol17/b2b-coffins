import { applyPercent } from '$lib/utils/money';

export interface PriceListWindow {
	readonly validFrom: Date | null;
	readonly validTo: Date | null;
}

export interface UnitPriceInput {
	/** Price stored on the variant itself: the last resort. */
	readonly basePriceMinor: number;
	/** Entry of the base price list, when the list has one for this variant. */
	readonly baseListPriceMinor?: number | undefined;
	/** Entry of the counterparty price list. Lists are sparse: most variants have none. */
	readonly personalListPriceMinor?: number | undefined;
}

/**
 * A price list applies inside its window. Open ends mean "since always" and "until further
 * notice"; the end moment itself is already outside.
 */
export function isPriceListActive(window: PriceListWindow, at: Date): boolean {
	const started = window.validFrom === null || window.validFrom.getTime() <= at.getTime();
	const notEnded = window.validTo === null || at.getTime() < window.validTo.getTime();
	return started && notEnded;
}

/** Personal price of a variant: counterparty list, then base list, then the variant price. */
export function resolveUnitPrice(input: UnitPriceInput): number {
	return input.personalListPriceMinor ?? input.baseListPriceMinor ?? input.basePriceMinor;
}

/**
 * Contract discount on the items total, in whole kopecks. The percent is the integer of
 * `counterparties.discount_percent`, so anything outside 0..100 is a data error, not a discount.
 * @throws RangeError for a percent outside 0..100 or a negative total.
 */
export function discountMinor(itemsTotalMinor: number, percent: number): number {
	if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
		throw new RangeError(`discount percent out of range: ${percent}`);
	}
	if (!Number.isInteger(itemsTotalMinor) || itemsTotalMinor < 0) {
		throw new RangeError(`items total must be a non-negative integer: ${itemsTotalMinor}`);
	}
	return applyPercent(itemsTotalMinor, percent);
}
