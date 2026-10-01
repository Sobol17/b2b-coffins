import type { RequestStatus } from '$lib/types/request';

const RUBLE_MINOR = 100;

export type MarkRefusal = 'nothing_due' | 'overpayment';
export type MarkVerdict =
	| { readonly ok: true; readonly amountMinor: number }
	| { readonly ok: false; readonly refusal: MarkRefusal };

/** Money is taken after the delivery only: there is no prepayment (tech.md v1.44). */
export function acceptsPayment(status: RequestStatus, isStockRequest: boolean): boolean {
	return status === 'awaiting_payment' && !isStockRequest;
}

/**
 * The amount a mark is written with. The screen shows and takes whole rubles while the rest keeps
 * its kopecks, so an amount within a ruble of the rest means "the rest": otherwise a request would
 * hang open over forty kopecks nobody can type, or the rounded rest would count as an overpayment.
 */
export function settledAmountMinor(dueMinor: number, enteredMinor: number): MarkVerdict {
	if (dueMinor <= 0) return { ok: false, refusal: 'nothing_due' };
	if (Math.abs(enteredMinor - dueMinor) < RUBLE_MINOR) return { ok: true, amountMinor: dueMinor };
	if (enteredMinor > dueMinor) return { ok: false, refusal: 'overpayment' };
	return { ok: true, amountMinor: enteredMinor };
}

export interface ReversibleMark {
	/** Set on a row that itself cancels an earlier mark. */
	readonly reversalOfId: number | null;
	readonly isReversed: boolean;
}

/** A mark is cancelled once, a reversal never: undoing the undo is just a new mark. */
export function isReversible(mark: ReversibleMark, status: RequestStatus): boolean {
	return status === 'awaiting_payment' && mark.reversalOfId === null && !mark.isReversed;
}
