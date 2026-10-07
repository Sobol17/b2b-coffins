import { realPushBrowser, UNSUPPORTED_BROWSER } from './push-browser';
import type { PushSubscriptionInput } from '$lib/validation/push';

export type PushStatus =
	'unsupported' | 'unconfigured' | 'needs_install' | 'blocked' | 'off' | 'on';

/** Everything the state needs from the browser, so a test can stand in for it. */
export interface PushBrowser {
	readonly supported: boolean;
	/** iOS delivers a push to an installed app only (tech.md 17). */
	readonly needsInstall: boolean;
	permission(): NotificationPermission;
	requestPermission(): Promise<NotificationPermission>;
	current(): Promise<PushSubscriptionInput | null>;
	subscribe(publicKey: string): Promise<PushSubscriptionInput>;
	unsubscribe(): Promise<void>;
	send(method: 'POST' | 'DELETE', body: unknown): Promise<void>;
}

/** Push on this very device: the permission of the browser and the subscription behind it. */
export class PushState {
	busy = $state(false);
	/** False until the first sync answered: a toggle drawn earlier would flash the wrong side. */
	ready = $state(false);
	private subscribed = $state(false);
	private permission = $state<NotificationPermission>('default');
	private endpoint: string | null = null;

	constructor(
		private readonly browser: PushBrowser,
		private readonly publicKey: string
	) {
		if (browser.supported) this.permission = browser.permission();
	}

	get status(): PushStatus {
		if (!this.browser.supported) return 'unsupported';
		if (this.publicKey === '') return 'unconfigured';
		if (this.browser.needsInstall) return 'needs_install';
		if (this.permission === 'denied') return 'blocked';
		return this.subscribed ? 'on' : 'off';
	}

	/** Must run from a click: browsers refuse a permission prompt that no gesture asked for. */
	async enable(): Promise<void> {
		if (this.status !== 'off') return;
		await this.run(async () => {
			this.permission = await this.browser.requestPermission();
			if (this.permission !== 'granted') return;
			await this.store(await this.browser.subscribe(this.publicKey));
		});
	}

	async disable(): Promise<void> {
		const endpoint = this.endpoint;
		if (endpoint === null) return;
		await this.run(async () => {
			// Server first: a row left behind would keep ringing a device that no longer listens.
			await this.browser.send('DELETE', { endpoint });
			await this.browser.unsubscribe();
			this.endpoint = null;
			this.subscribed = false;
		});
	}

	/**
	 * On every app open: sends the live subscription again, so a device the push service
	 * re-issued, or the server retired, starts ringing without a tap.
	 */
	async sync(): Promise<void> {
		try {
			if (this.status !== 'off' || this.permission !== 'granted') return;
			const current = await this.browser.current();
			if (current) await this.store(current);
		} finally {
			this.ready = true;
		}
	}

	private async store(subscription: PushSubscriptionInput): Promise<void> {
		await this.browser.send('POST', subscription);
		this.endpoint = subscription.endpoint;
		this.subscribed = true;
	}

	private async run(work: () => Promise<void>): Promise<void> {
		this.busy = true;
		try {
			await work();
		} finally {
			this.busy = false;
		}
	}
}

let shared: PushState | null = null;

/** One state per page session. The server render gets a stand-in that offers nothing. */
export function pushStateFor(publicKey: string): PushState {
	if (typeof window === 'undefined') return new PushState(UNSUPPORTED_BROWSER, publicKey);
	shared ??= new PushState(realPushBrowser(), publicKey);
	return shared;
}

/** What the handler needs of a submit event; the real one is a SubmitEvent on a form. */
interface FormSubmit {
	readonly target: unknown;
	preventDefault(): void;
}

function logoutFormOf(target: unknown): { submit(): void } | null {
	if (typeof target !== 'object' || target === null) return null;
	const form = target as { action?: unknown; submit?: unknown };
	if (typeof form.action !== 'string' || typeof form.submit !== 'function') return null;
	return new URL(form.action).pathname === '/logout' ? (form as { submit(): void }) : null;
}

/**
 * A shared phone must not ring for the person who signed out, so the logout form waits for the
 * device to be removed. A failed removal never blocks the sign-out itself.
 */
export async function leaveOnLogout(event: FormSubmit, state: PushState): Promise<void> {
	const form = logoutFormOf(event.target);
	if (!form || state.status !== 'on') return;
	event.preventDefault();
	try {
		await state.disable();
	} catch {
		// The server drops the device anyway once the push service reports it gone.
	} finally {
		form.submit();
	}
}
