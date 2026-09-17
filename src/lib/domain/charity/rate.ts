import type { RequestStatus } from '$lib/types/request';
import { roundHalfUp } from '$lib/utils/money';

const FULL_RATE_BP = 10_000;

/**
 * Donation of one request: `rateBp` basis points of what the counterparty pays (tech.md 5.9).
 * @throws RangeError for a rate outside 0 to 10000 basis points.
 */
export function charityAmountMinor(totalMinor: number, rateBp: number): number {
	if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > FULL_RATE_BP) {
		throw new RangeError(`charity rate out of range: ${rateBp}`);
	}
	return roundHalfUp((totalMinor * rateBp) / FULL_RATE_BP);
}

export interface CharityFreezeSubject {
	readonly totalMinor: number;
	readonly isStockRequest: boolean;
	readonly charityAmountMinor: number | null;
}

export interface CharityFreeze {
	readonly charityRateBp: number;
	readonly charityAmountMinor: number;
}

/**
 * What a delivery writes into the request, or null when it writes nothing: a stock request has no
 * donation (invariant 6) and a fixed amount never moves again (invariant 3).
 */
export function freezeCharity(subject: CharityFreezeSubject, rateBp: number): CharityFreeze | null {
	if (subject.isStockRequest || subject.charityAmountMinor !== null) return null;
	return {
		charityRateBp: rateBp,
		charityAmountMinor: charityAmountMinor(subject.totalMinor, rateBp)
	};
}

export type CharityScope =
	| { readonly kind: 'all' }
	| { readonly kind: 'year'; readonly year: number }
	| { readonly kind: 'counterparty'; readonly counterpartyId: number };

const YEAR_SCOPE = /^year:(\d{4})$/;
const COUNTERPARTY_SCOPE = /^cp:([1-9]\d*)$/;

/** Reads a `charity_totals.scope` key, or null when it is none of the three shapes. */
export function parseCharityScope(text: string): CharityScope | null {
	if (text === 'all') return { kind: 'all' };
	const year = YEAR_SCOPE.exec(text)?.[1];
	if (year !== undefined) return { kind: 'year', year: Number(year) };
	const counterparty = COUNTERPARTY_SCOPE.exec(text)?.[1];
	if (counterparty !== undefined) {
		const counterpartyId = Number(counterparty);
		return Number.isSafeInteger(counterpartyId) ? { kind: 'counterparty', counterpartyId } : null;
	}
	return null;
}

export function formatCharityScope(scope: CharityScope): string {
	switch (scope.kind) {
		case 'all':
			return 'all';
		case 'year':
			return `year:${scope.year}`;
		case 'counterparty':
			return `cp:${scope.counterpartyId}`;
	}
}

/** Calendar year of the moment on the wall clock of the organisation. */
export function yearInZone(at: Date, timeZone: string): number {
	return Number(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(at));
}

/** Rows of `charity_totals` a delivery changes: the whole fund, its year, the counterparty. */
export function scopesForDelivery(
	deliveredAt: Date,
	counterpartyId: number | null,
	timeZone: string
): string[] {
	const scopes: CharityScope[] = [
		{ kind: 'all' },
		{ kind: 'year', year: yearInZone(deliveredAt, timeZone) }
	];
	if (counterpartyId !== null) scopes.push({ kind: 'counterparty', counterpartyId });
	return scopes.map(formatCharityScope);
}

export interface DeliveredCharityRow {
	readonly status: RequestStatus;
	readonly isStockRequest: boolean;
	readonly counterpartyId: number | null;
	readonly charityAmountMinor: number | null;
	readonly deliveredAt: Date | null;
}

const OUTSIDE_FUND: ReadonlySet<RequestStatus> = new Set(['cancelled', 'rejected']);

/** The banner counts a fixed donation of a delivered counterparty request, nothing else. */
export function countsTowardFund(row: DeliveredCharityRow): boolean {
	return (
		row.charityAmountMinor !== null &&
		row.deliveredAt !== null &&
		!row.isStockRequest &&
		!OUTSIDE_FUND.has(row.status)
	);
}

function inScope(row: DeliveredCharityRow, scope: CharityScope, timeZone: string): boolean {
	switch (scope.kind) {
		case 'all':
			return true;
		case 'year':
			return row.deliveredAt !== null && yearInZone(row.deliveredAt, timeZone) === scope.year;
		case 'counterparty':
			return row.counterpartyId === scope.counterpartyId;
	}
}

export interface CharityTally {
	readonly amountMinor: number;
	readonly requestCount: number;
}

/** One row of `charity_totals`, rebuilt from the frozen amounts and never from a running sum. */
export function tallyCharity(
	rows: readonly DeliveredCharityRow[],
	scope: CharityScope,
	timeZone: string
): CharityTally {
	let amountMinor = 0;
	let requestCount = 0;
	for (const row of rows) {
		if (!countsTowardFund(row) || !inScope(row, scope, timeZone)) continue;
		amountMinor += row.charityAmountMinor ?? 0;
		requestCount += 1;
	}
	return { amountMinor, requestCount };
}
