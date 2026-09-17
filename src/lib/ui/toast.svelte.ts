import type { ResolvedPathname } from '$app/types';

export const TOAST_KINDS = ['success', 'error', 'info', 'warning'] as const;
export type ToastKind = (typeof TOAST_KINDS)[number];

/** A link the toast offers next to its text, for example «Открыть заявку». */
export interface ToastAction {
	readonly label: string;
	readonly href: ResolvedPathname;
}

export interface ToastOptions {
	readonly description?: string;
	/** 0 keeps the toast until the user closes it. */
	readonly durationMs?: number;
	readonly action?: ToastAction;
}

export interface Toast {
	readonly id: number;
	readonly kind: ToastKind;
	readonly title: string;
	readonly description: string | null;
	readonly action: ToastAction | null;
	readonly durationMs: number;
}

/** An error needs time to be read and acted on; a confirmation only needs a glance. */
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = {
	success: 4000,
	info: 5000,
	warning: 7000,
	error: 9000
};

/** More than this and the stack covers the form the user is working with. */
export const TOAST_LIMIT = 4;

interface Timer {
	handle: ReturnType<typeof setTimeout> | null;
	remainingMs: number;
	startedAt: number;
}

/*
 * Client-side notice queue (tech.md 9). Nothing user-specific is kept here: the store only holds
 * messages the current page pushed, so the module singleton carries no state across requests.
 */
class ToastStore {
	#items = $state<Toast[]>([]);
	#timers = new Map<number, Timer>();
	#nextId = 1;

	get items(): readonly Toast[] {
		return this.#items;
	}

	success(title: string, options?: ToastOptions): number {
		return this.show('success', title, options);
	}

	error(title: string, options?: ToastOptions): number {
		return this.show('error', title, options);
	}

	info(title: string, options?: ToastOptions): number {
		return this.show('info', title, options);
	}

	warning(title: string, options?: ToastOptions): number {
		return this.show('warning', title, options);
	}

	/**
	 * A repeated notice restarts the one on screen instead of stacking a copy: a double click on
	 * «Сохранить» should read as one confirmation.
	 */
	show(kind: ToastKind, title: string, options: ToastOptions = {}): number {
		const description = options.description ?? null;
		const durationMs = options.durationMs ?? TOAST_DURATION_MS[kind];
		const twin = this.#items.find(
			(item) => item.kind === kind && item.title === title && item.description === description
		);
		if (twin) {
			this.#arm(twin.id, twin.durationMs);
			return twin.id;
		}

		const id = this.#nextId++;
		const next = { id, kind, title, description, action: options.action ?? null, durationMs };
		const kept = this.#items.slice(-(TOAST_LIMIT - 1));
		for (const dropped of this.#items.slice(0, this.#items.length - kept.length)) {
			this.#disarm(dropped.id);
		}
		this.#items = [...kept, next];
		this.#arm(id, durationMs);
		return id;
	}

	/** Dropping an id that is already gone is a no-op: a timer and a click can race on one toast. */
	dismiss(id: number): void {
		this.#disarm(id);
		this.#items = this.#items.filter((item) => item.id !== id);
	}

	/** Hover or focus holds the toast: text that vanishes under the pointer cannot be read. */
	pause(id: number): void {
		const timer = this.#timers.get(id);
		if (!timer?.handle) return;
		clearTimeout(timer.handle);
		timer.handle = null;
		timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
	}

	resume(id: number): void {
		const timer = this.#timers.get(id);
		if (!timer || timer.handle) return;
		this.#arm(id, timer.remainingMs);
	}

	clear(): void {
		for (const id of this.#timers.keys()) this.#disarm(id);
		this.#items = [];
	}

	#arm(id: number, ms: number): void {
		this.#disarm(id);
		if (ms <= 0) return;
		this.#timers.set(id, {
			handle: setTimeout(() => this.dismiss(id), ms),
			remainingMs: ms,
			startedAt: Date.now()
		});
	}

	#disarm(id: number): void {
		const timer = this.#timers.get(id);
		if (timer?.handle) clearTimeout(timer.handle);
		this.#timers.delete(id);
	}
}

export const toast = new ToastStore();
