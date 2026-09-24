import { isDeliveryFilled, type DeliveryFacts } from './delivery';
import type { GuardCode } from '$lib/types/request';

/** What the server knows about a request before it asks the state machine. */
export interface GuardFacts {
	/** Every line filled from free stock by `allocateStock` (tech.md v1.41). */
	readonly stockCovered: boolean;
	/** Frozen unit price of every line of the request. */
	readonly unitPricesMinor: readonly number[];
	readonly totalMinor: number;
	readonly paymentMarksMinor: readonly number[];
	readonly delivery: DeliveryFacts;
}

/** A request is priced when it has lines and none of them is left at zero. */
export function pricesFixed(unitPricesMinor: readonly number[]): boolean {
	return unitPricesMinor.length > 0 && unitPricesMinor.every((price) => price > 0);
}

/** Partial payments add up; the request is paid once the marks cover the total to the kopeck. */
export function fullyPaid(totalMinor: number, paymentMarksMinor: readonly number[]): boolean {
	return paymentMarksMinor.reduce((sum, amount) => sum + amount, 0) >= totalMinor;
}

/** Every guard of tech.md 6.2 evaluated at once, so no transition sees a guard left undefined. */
export function evaluateGuards(facts: GuardFacts): Record<GuardCode, boolean> {
	return {
		stockCovered: facts.stockCovered,
		pricesFixed: pricesFixed(facts.unitPricesMinor),
		fullyPaid: fullyPaid(facts.totalMinor, facts.paymentMarksMinor),
		deliveryFilled: isDeliveryFilled(facts.delivery)
	};
}
