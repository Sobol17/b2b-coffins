import { settledAmountMinor, type MarkRefusal } from './mark';

export interface OpenRequest {
	readonly requestId: number;
	/** Unpaid rest of the request, in kopecks. */
	readonly dueMinor: number;
}

export interface Allocation {
	readonly requestId: number;
	readonly amountMinor: number;
}

export type AllocationVerdict =
	| { readonly ok: true; readonly amountMinor: number; readonly allocations: readonly Allocation[] }
	| { readonly ok: false; readonly refusal: MarkRefusal };

/**
 * Spreads one payment of a counterparty over its open requests in the given order, oldest first
 * (tech.md v1.65). Each request takes up to its rest before the next one gets anything. The amount
 * follows the same rule as a mark of one request: within a ruble of the whole debt means the debt,
 * and more than the debt is refused, because there is no prepayment.
 */
export function allocatePayment(
	open: readonly OpenRequest[],
	enteredMinor: number
): AllocationVerdict {
	const owed = open.filter((request) => request.dueMinor > 0);
	const debtMinor = owed.reduce((sum, request) => sum + request.dueMinor, 0);
	const verdict = settledAmountMinor(debtMinor, enteredMinor);
	if (!verdict.ok) return verdict;
	const allocations: Allocation[] = [];
	let left = verdict.amountMinor;
	for (const request of owed) {
		if (left <= 0) break;
		const amountMinor = Math.min(left, request.dueMinor);
		allocations.push({ requestId: request.requestId, amountMinor });
		left -= amountMinor;
	}
	return { ok: true, amountMinor: verdict.amountMinor, allocations };
}
