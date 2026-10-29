import type { WorkRole } from '$lib/types/roles';

/** One line of a request in work, as the dispatch compares it with the shop. */
export interface DispatchLine {
	readonly itemId: number;
	readonly requestId: number;
	/** shelfWant for a counterparty line, qty minus pieces past the upholsterer for a stock line. */
	readonly wantQty: number;
	/** Pieces allocateStock gives the line now; always 0 for a stock line. */
	readonly filledQty: number;
}

/** A job not yet past the upholsterer. */
export interface OpenJob {
	readonly id: number;
	readonly itemId: number;
	readonly station: WorkRole;
	readonly qty: number;
	readonly doneQty: number;
}

export type DispatchStep =
	| {
			readonly kind: 'add';
			readonly itemId: number;
			readonly requestId: number;
			readonly qty: number;
	  }
	/** The new qty of the job; 0 removes it. */
	| { readonly kind: 'shrink'; readonly jobId: number; readonly qty: number };

/**
 * What the shop must gain or give back so every line gets exactly its missing pieces (tech.md §20.4).
 * A shortage goes to the carpenter; a surplus comes back only from the undone part of the carpenter
 * job, since a piece already sanded or painted is worth finishing for the shelf.
 */
export function planDispatch(
	lines: readonly DispatchLine[],
	jobs: readonly OpenJob[]
): DispatchStep[] {
	const steps: DispatchStep[] = [];
	for (const line of lines) {
		const own = jobs.filter((job) => job.itemId === line.itemId);
		const inShop = own.reduce((sum, job) => sum + job.qty, 0);
		const need = line.wantQty - line.filledQty - inShop;
		if (need > 0) {
			steps.push({ kind: 'add', itemId: line.itemId, requestId: line.requestId, qty: need });
			continue;
		}
		const carpenter = own.find((job) => job.station === 'carpenter');
		if (need === 0 || !carpenter) continue;
		const qty = Math.max(carpenter.doneQty, carpenter.qty + need);
		if (qty < carpenter.qty) steps.push({ kind: 'shrink', jobId: carpenter.id, qty });
	}
	return steps;
}

/** Guard `stockCovered` for a stock request: every line has its pieces past the upholsterer. */
export function isMadeByShop(
	lines: readonly { readonly qty: number; readonly madeQty: number }[]
): boolean {
	return lines.length > 0 && lines.every((line) => line.madeQty >= line.qty);
}
