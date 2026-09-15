export interface PushTarget {
	readonly endpoint: string;
	readonly p256dh: string;
	readonly auth: string;
}

/**
 * Fields of the service worker handler in tech.md 17.2. Number, short text and a link only:
 * the notification shows on a locked screen (tech.md 17.3).
 */
export interface PushMessage {
	readonly title: string;
	readonly body: string;
	readonly url: string;
	readonly tag?: string;
}

export interface PushDriver {
	send(target: PushTarget, message: PushMessage): Promise<void>;
}

export { FakePushDriver, fakePushDriver } from './fake';
