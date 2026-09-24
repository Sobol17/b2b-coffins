import type { RequestStatus } from '$lib/types/request';

/** Handed over and not closed: the only statuses that can owe money (tech.md v1.39). */
export const DEBT_STATUSES = [
	'delivered',
	'awaiting_payment'
] as const satisfies readonly RequestStatus[];

export interface DebtRequest {
	readonly status: RequestStatus;
	readonly totalMinor: number;
	readonly marksMinor: readonly number[];
}

export interface Debt {
	readonly debtMinor: number;
	readonly openCount: number;
}

/**
 * Unpaid rest of one request. An overpayment is not credit against another request: the rest of
 * that request is zero, the surplus is the manager's question, not the debt indicator's.
 */
export function requestDebtMinor(totalMinor: number, marksMinor: readonly number[]): number {
	const paid = marksMinor.reduce((sum, amount) => sum + amount, 0);
	return Math.max(0, totalMinor - paid);
}

/** Debt of a counterparty and the number of requests that still owe something. */
export function counterpartyDebt(requests: readonly DebtRequest[]): Debt {
	let debtMinor = 0;
	let openCount = 0;
	for (const request of requests) {
		if (!(DEBT_STATUSES as readonly RequestStatus[]).includes(request.status)) continue;
		const rest = requestDebtMinor(request.totalMinor, request.marksMinor);
		debtMinor += rest;
		if (rest > 0) openCount += 1;
	}
	return { debtMinor, openCount };
}
