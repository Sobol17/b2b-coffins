import type { RequestStatus } from '$lib/types/request';

/**
 * Who takes stock first (tech.md §20.4). `held`: a counterparty request already assembled, its pieces
 * wait on the shelf for the driver; `work`: a counterparty request in work. A stock request takes
 * nothing: what the shop makes for it lands on the shelf as free stock.
 */
export const FILL_TIERS = ['held', 'work'] as const;
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
	/** Pieces already loaded for delivery (tech.md v1.43): they left the shelf with a shipment move. */
	readonly loadedQty: number;
	readonly tier: FillTier;
	readonly isUrgent: boolean;
	readonly deliveryAt: Date | null;
}

/** The stock position of a product: one stock item in one colour. */
export function positionKey(stockItemId: number, optionId: number | null): string {
	return `${stockItemId}:${optionId ?? '-'}`;
}

/**
 * Pieces the line still wants from the shelf. A loaded piece already left the balance through its
 * shipment move, so holding it again would count it twice (tech.md v1.43).
 */
export function shelfWant(line: Pick<DemandLine, 'qty' | 'loadedQty'>): number {
	return Math.max(0, line.qty - line.loadedQty);
}

/** A stock request never holds stock, in work or assembled. */
export function fillTier(status: RequestStatus, isStockRequest: boolean): FillTier | null {
	if (isStockRequest) return null;
	if (status === 'ready') return 'held';
	if (status === 'in_work') return 'work';
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
 * Hands the balance of every position out to the lines in `fillOrder`, each up to `shelfWant`.
 * A negative balance fills nothing. @returns the filled pieces per line id, every line present.
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
		const take = Math.min(free, shelfWant(line));
		left.set(key, free - take);
		filled.set(line.itemId, take);
	}
	return filled;
}

/** Guard `stockCovered`: a request with lines, every one of them filled to the piece. */
export function isCovered(
	lines: readonly Pick<DemandLine, 'itemId' | 'qty' | 'loadedQty'>[],
	filled: ReadonlyMap<number, number>
): boolean {
	return (
		lines.length > 0 && lines.every((line) => (filled.get(line.itemId) ?? 0) >= shelfWant(line))
	);
}

/**
 * Requests ahead of the line in `fillOrder` that hold pieces of its position: they are why the line
 * gets less than it wants. @returns request ids in queue order, the line's own request left out.
 */
export function heldAhead(
	line: DemandLine,
	lines: readonly DemandLine[],
	filled: ReadonlyMap<number, number>
): number[] {
	if (line.stockItemId === null) return [];
	const key = positionKey(line.stockItemId, line.optionId);
	const ahead: number[] = [];
	for (const other of [...lines].sort(fillOrder)) {
		if (other.itemId === line.itemId) break;
		if (other.requestId === line.requestId || other.stockItemId === null) continue;
		if (positionKey(other.stockItemId, other.optionId) !== key) continue;
		if ((filled.get(other.itemId) ?? 0) > 0 && !ahead.includes(other.requestId)) {
			ahead.push(other.requestId);
		}
	}
	return ahead;
}
