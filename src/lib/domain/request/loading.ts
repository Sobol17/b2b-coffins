/** A request line as the loading sees it (tech.md v1.43). */
export interface LoadedLine {
	readonly qty: number;
	/** Minus the sum of the stock moves that carry the line: loadings and their reversals. */
	readonly loadedQty: number;
}

/**
 * Guard `fullyLoaded`: a counterparty request leaves for delivery only with every line on board.
 * A stock request stays on the shelf, so it has nothing to load and passes.
 */
export function isFullyLoaded(isStockRequest: boolean, lines: readonly LoadedLine[]): boolean {
	if (isStockRequest) return true;
	return lines.length > 0 && lines.every((line) => line.loadedQty >= line.qty);
}

/**
 * Pieces one loading may add to the line: the rest of the line, and no more than the stock fill
 * holds for it. The server refuses anything above, so the screen offers exactly this much.
 */
export function loadableQty(line: LoadedLine, filledQty: number): number {
	return Math.max(0, Math.min(line.qty - line.loadedQty, filledQty));
}
