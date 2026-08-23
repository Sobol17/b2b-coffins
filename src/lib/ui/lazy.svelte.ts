/**
 * Deferred loader for the half of a control that lives behind a trigger. The calendar and the
 * command palette are the heaviest parts of the kit, and a page that never opens them must not
 * carry them: the import fires on the first open and the resolved component is reused after that.
 *
 * Not a primitive of tech.md 9 and not exported from the kit barrel: it is a composition detail of
 * DatePicker, DateRangePicker and Combobox.
 */
export class LazyComponent<TComponent> {
	readonly #load: () => Promise<{ default: TComponent }>;
	#requested = false;
	#component = $state<TComponent | null>(null);
	#failed = $state(false);

	constructor(load: () => Promise<{ default: TComponent }>) {
		this.#load = load;
	}

	get component(): TComponent | null {
		return this.#component;
	}

	get failed(): boolean {
		return this.#failed;
	}

	/** Idempotent: opening a popover twice must not fire the import twice. */
	request(): void {
		if (this.#requested) return;
		this.#requested = true;
		void this.#load().then(
			(module) => {
				this.#component = module.default;
			},
			() => {
				this.#failed = true;
			}
		);
	}
}
