export type ToastKind = 'success' | 'error';

export interface Toast {
	readonly id: number;
	readonly kind: ToastKind;
	readonly message: string;
}

const DEFAULT_TTL_MS = 5000;

/*
 * Client-side notice queue (tech.md 9). Nothing user-specific is kept here: the store only holds
 * messages the current page pushed, so the module singleton carries no state across requests.
 */
class ToastStore {
	#items = $state<Toast[]>([]);
	#nextId = 1;

	get items(): readonly Toast[] {
		return this.#items;
	}

	success(message: string, ttlMs: number = DEFAULT_TTL_MS): number {
		return this.#push('success', message, ttlMs);
	}

	error(message: string, ttlMs: number = DEFAULT_TTL_MS): number {
		return this.#push('error', message, ttlMs);
	}

	/** Dropping an id that is already gone is a no-op: a timer and a click can race on one toast. */
	dismiss(id: number): void {
		this.#items = this.#items.filter((item) => item.id !== id);
	}

	clear(): void {
		this.#items = [];
	}

	#push(kind: ToastKind, message: string, ttlMs: number): number {
		const id = this.#nextId++;
		this.#items = [...this.#items, { id, kind, message }];
		if (ttlMs > 0) setTimeout(() => this.dismiss(id), ttlMs);
		return id;
	}
}

export const toast = new ToastStore();
