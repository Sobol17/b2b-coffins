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

export interface LineInput {
	/** Personal price of the variant, without options. */
	readonly unitPriceMinor: number;
	readonly optionDeltasMinor: readonly number[];
	readonly qty: number;
}

/**
 * Price of one request line: the variant price plus every option surcharge, times the quantity.
 * @throws RangeError for a quantity that is not a positive whole number.
 */
export function lineTotalMinor(line: LineInput): number {
	if (!Number.isInteger(line.qty) || line.qty < 1) {
		throw new RangeError(`quantity must be a positive integer: ${line.qty}`);
	}
	const piece = line.optionDeltasMinor.reduce((sum, delta) => sum + delta, line.unitPriceMinor);
	return piece * line.qty;
}

export interface RequestTotals {
	readonly itemsTotalMinor: number;
	readonly discountMinor: number;
	readonly totalMinor: number;
}

/**
 * Totals of a request. The contract discount applies once to the items total, not per line:
 * rounding per line would drift from the sum by a kopeck for every line.
 */
export function requestTotals(
	lineTotals: readonly number[],
	discountPercent: number
): RequestTotals {
	const itemsTotalMinor = lineTotals.reduce((sum, value) => sum + value, 0);
	const discount = discountMinor(itemsTotalMinor, discountPercent);
	return { itemsTotalMinor, discountMinor: discount, totalMinor: itemsTotalMinor - discount };
}
