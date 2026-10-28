import { isDeliveryFilled, type DeliveryFacts } from './delivery';
import { isFullyLoaded, type LoadedLine } from './loading';
import type { GuardCode } from '$lib/types/request';

/** What the server knows about a request before it asks the state machine. */
export interface GuardFacts {
	/** Every line filled from free stock by `allocateStock` (tech.md v1.41). */
	readonly stockCovered: boolean;
	/** Frozen unit price of every line of the request. */
	readonly unitPricesMinor: readonly number[];
	readonly totalMinor: number;
	readonly paymentMarksMinor: readonly number[];
	/** What the counterparty still owes on its other handed-over requests (tech.md v1.65). */
	readonly otherDebtMinor: number;
	readonly delivery: DeliveryFacts;
	/** Every line with its loaded pieces (tech.md v1.43). */
	readonly loadedLines: readonly LoadedLine[];
}

/** A request is priced when it has lines and none of them is left at zero. */
export function pricesFixed(unitPricesMinor: readonly number[]): boolean {
	return unitPricesMinor.length > 0 && unitPricesMinor.every((price) => price > 0);
}

/**
 * Partial payments add up; the request is paid once the marks cover the total to the kopeck and the
 * counterparty owes nothing on its other requests (tech.md v1.65): its requests close together, when
 * the whole debt is repaid.
 */
export function fullyPaid(
	totalMinor: number,
	paymentMarksMinor: readonly number[],
	otherDebtMinor = 0
): boolean {
	const covered = paymentMarksMinor.reduce((sum, amount) => sum + amount, 0) >= totalMinor;
	return covered && otherDebtMinor <= 0;
}

/** Every guard of tech.md 6.2 evaluated at once, so no transition sees a guard left undefined. */
export function evaluateGuards(facts: GuardFacts): Record<GuardCode, boolean> {
	return {
		stockCovered: facts.stockCovered,
		pricesFixed: pricesFixed(facts.unitPricesMinor),
		fullyPaid: fullyPaid(facts.totalMinor, facts.paymentMarksMinor, facts.otherDebtMinor),
		deliveryFilled: isDeliveryFilled(facts.delivery),
		fullyLoaded: isFullyLoaded(facts.delivery.isStockRequest, facts.loadedLines)
	};
}
