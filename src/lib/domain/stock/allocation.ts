import type { RequestStatus } from '$lib/types/request';

/**
 * Who takes stock first (tech.md v1.41). `held`: a counterparty request already assembled, its pieces
 * wait on the shelf for the driver; `work`: a counterparty request in work; `stock`: a stock request
 * in work, served last because it only plans production for the shelf.
 */
export const FILL_TIERS = ['held', 'work', 'stock'] as const;
export type FillTier = (typeof FILL_TIERS)[number];

/** One line of a request that wants pieces from stock. */
export interface DemandLine {
	readonly itemId: number;
	readonly requestId: number;
	readonly variantId: number;
	readonly optionId: number | null;
	/** Null when the variant has no stock item: such a line can never be filled. */
	readonly stockItemId: number | null;
	readonly qty: number;
	readonly tier: FillTier;
	readonly isUrgent: boolean;
	readonly deliveryAt: Date | null;
}

export interface ProductionNeed {
	readonly variantId: number;
	readonly optionId: number | null;
	readonly neededQty: number;
	readonly requestCount: number;
	readonly nearestDeliveryAt: Date | null;
	readonly hasUrgent: boolean;
}

/** The stock position of a product: one stock item in one colour. */
export function positionKey(stockItemId: number, optionId: number | null): string {
	return `${stockItemId}:${optionId ?? '-'}`;
}

/** A stock request in `ready` holds nothing: its pieces are free stock for everyone else. */
export function fillTier(status: RequestStatus, isStockRequest: boolean): FillTier | null {
	if (status === 'ready') return isStockRequest ? null : 'held';
	if (status === 'in_work') return isStockRequest ? 'stock' : 'work';
	return null;
}

/** Held first, then urgent, then the nearest deadline; a request without one waits for the rest. */
export function fillOrder(a: DemandLine, b: DemandLine): number {
	return (
		FILL_TIERS.indexOf(a.tier) - FILL_TIERS.indexOf(b.tier) ||
		Number(b.isUrgent) - Number(a.isUrgent) ||
		deadlineRank(a.deliveryAt) - deadlineRank(b.deliveryAt) ||
		a.requestId - b.requestId ||
		a.itemId - b.itemId
	);
}

function deadlineRank(at: Date | null): number {
	return at === null ? Number.POSITIVE_INFINITY : at.getTime();
}

/**
 * Hands the balance of every position out to the lines in `fillOrder`. A negative balance fills
 * nothing. @returns the filled pieces per line id, every line present.
 */
export function allocateStock(
	lines: readonly DemandLine[],
	balances: ReadonlyMap<string, number>
): Map<number, number> {
	const left = new Map<string, number>();
	const filled = new Map<number, number>();
	for (const line of [...lines].sort(fillOrder)) {
		if (line.stockItemId === null) {
			filled.set(line.itemId, 0);
			continue;
		}
		const key = positionKey(line.stockItemId, line.optionId);
		const free = left.get(key) ?? Math.max(0, balances.get(key) ?? 0);
		const take = Math.min(free, Math.max(0, line.qty));
		left.set(key, free - take);
		filled.set(line.itemId, take);
	}
	return filled;
}

/** Guard `stockCovered`: a request with lines, every one of them filled to the piece. */
export function isCovered(
	lines: readonly Pick<DemandLine, 'itemId' | 'qty'>[],
	filled: ReadonlyMap<number, number>
): boolean {
	return lines.length > 0 && lines.every((line) => (filled.get(line.itemId) ?? 0) >= line.qty);
}

/**
 * What the shop still has to make: the unfilled pieces of requests in work, per variant and colour.
 * Held requests are complete by the guard, so only `work` and `stock` lines can lack anything.
 */
export function productionNeeds(
	lines: readonly DemandLine[],
	filled: ReadonlyMap<number, number>
): ProductionNeed[] {
	const needs = new Map<string, ProductionNeed>();
	const requests = new Map<string, Set<number>>();
	for (const line of lines) {
		const missing = line.qty - (filled.get(line.itemId) ?? 0);
		if (line.tier === 'held' || missing <= 0) continue;
		const key = `${line.variantId}:${line.optionId ?? '-'}`;
		const seen = requests.get(key) ?? new Set<number>();
		requests.set(key, seen.add(line.requestId));
		const need = needs.get(key);
		needs.set(key, {
			variantId: line.variantId,
			optionId: line.optionId,
			neededQty: (need?.neededQty ?? 0) + missing,
			requestCount: seen.size,
			hasUrgent: (need?.hasUrgent ?? false) || line.isUrgent,
			nearestDeliveryAt: earlier(need?.nearestDeliveryAt ?? null, line.deliveryAt)
		});
	}
	return [...needs.values()].sort(needOrder);
}

function earlier(a: Date | null, b: Date | null): Date | null {
	if (a === null) return b;
	if (b === null) return a;
	return a.getTime() <= b.getTime() ? a : b;
}

function needOrder(a: ProductionNeed, b: ProductionNeed): number {
	return (
		Number(b.hasUrgent) - Number(a.hasUrgent) ||
		deadlineRank(a.nearestDeliveryAt) - deadlineRank(b.nearestDeliveryAt) ||
		a.variantId - b.variantId ||
		(a.optionId ?? 0) - (b.optionId ?? 0)
	);
}
