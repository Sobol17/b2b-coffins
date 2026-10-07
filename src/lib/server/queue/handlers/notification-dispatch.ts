import { PushGoneError, type PushDriver, type PushMessage } from '../../notifications/drivers/push';
import { pushDriver } from '../../notifications/drivers/push/select';
import { PUSH_TIMEOUT_MS } from '../../notifications/drivers/push/webpush';
import { NotificationRepository } from '../../notifications/notification.repository';
import { PushMessageService } from '../../notifications/push-message.service';
import {
	PushSubscriptionRepository,
	type LiveSubscription
} from '../../notifications/push-subscription.repository';
import { defineHandler, InvalidPayloadError } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';
import { failureText } from '$lib/domain/notification/delivery';

export interface DispatchDeps {
	readonly notifications: NotificationRepository;
	readonly subscriptions: PushSubscriptionRepository;
	readonly messages: Pick<PushMessageService, 'build'>;
	readonly driver: () => PushDriver;
	readonly timeoutMs?: number;
}

interface Outcome {
	readonly accepted: number;
	readonly errors: string[];
}

/**
 * `notification.dispatch` of tech.md 7.2: sends one row to every live device of its person and
 * marks it. A refusal that time cannot cure, no device or no text, fails the row and ends the
 * job; a driver error or a timeout fails the row and throws, so the queue retries with backoff.
 */
export function createNotificationDispatchHandler(deps: DispatchDeps) {
	const timeoutMs = deps.timeoutMs ?? PUSH_TIMEOUT_MS;

	async function sendToAll(
		targets: readonly LiveSubscription[],
		message: PushMessage,
		now: Date
	): Promise<Outcome> {
		const errors: string[] = [];
		let accepted = 0;
		for (const target of targets) {
			try {
				await withTimeout(deps.driver().send(target, message), timeoutMs);
				deps.subscriptions.touch(target.id, now);
				accepted += 1;
			} catch (err) {
				if (err instanceof PushGoneError) deps.subscriptions.markExpired(target.id, now);
				else errors.push(err instanceof Error ? err.message : String(err));
			}
		}
		return { accepted, errors };
	}

	return defineHandler({
		topic: 'notification.dispatch',
		schema: JOB_PAYLOAD_SCHEMAS['notification.dispatch'],
		async handle({ notificationId }, ctx) {
			const row = deps.notifications.forDispatch(notificationId);
			if (!row) throw new InvalidPayloadError(`notification ${notificationId} not found`);
			if (row.status === 'sent') return;
			const attempts = row.attempts + 1;
			const fail = (text: string): void => deps.notifications.markFailed(row.id, attempts, text);
			if (row.channel !== 'push') {
				fail(`channel ${row.channel} is not live`);
				throw new InvalidPayloadError(`channel ${row.channel} is not live`);
			}

			const targets = deps.subscriptions.liveOf(row.userId);
			if (targets.length === 0) return fail(failureText('expired', 'no live subscription'));
			const message = deps.messages.build(row);
			if (!message) return fail(failureText('driver', 'no active template or entity'));

			const outcome = await sendToAll(targets, message, ctx.now);
			if (outcome.accepted > 0) return deps.notifications.markSent(row.id, attempts, ctx.now);
			const [reason] = outcome.errors;
			if (reason === undefined) return fail(failureText('expired', 'every subscription is gone'));
			fail(failureText('driver', reason));
			throw new Error(`push failed: ${reason}`);
		}
	});
}

/** A push service that never answers must not hold the worker: the job retries instead. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`push timed out after ${ms} ms`)), ms);
		work.then(resolve, reject).finally(() => clearTimeout(timer));
	});
}

export const notificationDispatchHandler = createNotificationDispatchHandler({
	notifications: new NotificationRepository(),
	subscriptions: new PushSubscriptionRepository(),
	messages: new PushMessageService(),
	driver: pushDriver
});
