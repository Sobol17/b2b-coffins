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

/** The push service answered 404 or 410: the subscription will never accept a message again. */
export class PushGoneError extends Error {
	constructor(readonly endpoint: string) {
		super('push subscription is gone');
		this.name = 'PushGoneError';
	}
}

export { FakePushDriver, fakePushDriver } from './fake';
