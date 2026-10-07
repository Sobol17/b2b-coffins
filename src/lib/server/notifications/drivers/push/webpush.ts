import webpush, { WebPushError } from 'web-push';
import { PushGoneError, type PushDriver, type PushMessage, type PushTarget } from './index';

// A request ready in the evening must not ring at dawn: the push service drops it after four hours.
export const PUSH_TTL_SECONDS = 14_400;
export const PUSH_TIMEOUT_MS = 10_000;

export interface VapidDetails {
	readonly subject: string;
	readonly publicKey: string;
	readonly privateKey: string;
}

export type PushTransport = (
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
	payload: string,
	options: { vapidDetails: VapidDetails; TTL: number; urgency: 'high'; timeout: number }
) => Promise<unknown>;

export class WebPushDriver implements PushDriver {
	constructor(
		private readonly vapid: VapidDetails,
		private readonly transport: PushTransport = (subscription, payload, options) =>
			webpush.sendNotification(subscription, payload, options)
	) {}

	async send(target: PushTarget, message: PushMessage): Promise<void> {
		const subscription = {
			endpoint: target.endpoint,
			keys: { p256dh: target.p256dh, auth: target.auth }
		};
		try {
			await this.transport(subscription, JSON.stringify(message), {
				vapidDetails: this.vapid,
				TTL: PUSH_TTL_SECONDS,
				urgency: 'high',
				timeout: PUSH_TIMEOUT_MS
			});
		} catch (err) {
			if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
				throw new PushGoneError(target.endpoint);
			}
			throw err;
		}
	}
}
