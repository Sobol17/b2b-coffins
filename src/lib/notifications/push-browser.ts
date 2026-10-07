import type { PushBrowser } from './push-state.svelte';
import { isIos, isStandalone } from '$lib/ui/install.svelte';
import type { PushSubscriptionInput } from '$lib/validation/push';

const ENDPOINT = '/api/push/subscription';

function toInput(subscription: PushSubscription): PushSubscriptionInput {
	const keys = subscription.toJSON().keys;
	return {
		endpoint: subscription.endpoint,
		p256dh: keys?.['p256dh'] ?? '',
		auth: keys?.['auth'] ?? ''
	};
}

async function manager(): Promise<PushManager> {
	return (await navigator.serviceWorker.ready).pushManager;
}

/** What the server render and a browser without push get: nothing is offered, nothing is called. */
export const UNSUPPORTED_BROWSER: PushBrowser = {
	supported: false,
	needsInstall: false,
	permission: () => 'default',
	requestPermission: () => Promise.resolve('default'),
	current: () => Promise.resolve(null),
	subscribe: () => Promise.reject(new Error('push is not supported here')),
	unsubscribe: () => Promise.resolve(),
	send: () => Promise.resolve()
};

/** The Push API of this browser behind the interface the state talks to. */
export function realPushBrowser(): PushBrowser {
	const supported =
		'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
	if (!supported) return UNSUPPORTED_BROWSER;
	return {
		supported,
		needsInstall: isIos() && !isStandalone(),
		permission: () => Notification.permission,
		requestPermission: () => Notification.requestPermission(),
		async current() {
			const subscription = await (await manager()).getSubscription();
			return subscription ? toInput(subscription) : null;
		},
		async subscribe(publicKey) {
			const push = await manager();
			return toInput(
				await push.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })
			);
		},
		async unsubscribe() {
			await (await (await manager()).getSubscription())?.unsubscribe();
		},
		async send(method, body) {
			const response = await fetch(ENDPOINT, {
				method,
				headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
				body: JSON.stringify(body)
			});
			if (!response.ok) throw new Error(`push subscription ${method} answered ${response.status}`);
		}
	};
}
