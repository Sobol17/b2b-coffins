/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

// Push-only worker: no fetch handler, no caches. Offline mode is out of scope (tech.md 17.2).
const sw = self as unknown as ServiceWorkerGlobalScope;

interface PushPayload {
	readonly title?: string;
	readonly body?: string;
	readonly url?: string;
	readonly tag?: string;
}

sw.addEventListener('install', () => void sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	const data = (event.data?.json() ?? {}) as PushPayload;
	// iOS revokes a subscription whose push shows nothing, so a notification appears whatever came.
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'Заявки', {
			body: data.body ?? '',
			icon: '/icons/icon-192.png',
			...(data.tag ? { tag: data.tag } : {}),
			data: { url: data.url ?? '/' }
		})
	);
});

// Deep-link straight into the request card instead of the app root.
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = event.notification.data as { url?: string } | null;
	event.waitUntil(sw.clients.openWindow(data?.url ?? '/'));
});
