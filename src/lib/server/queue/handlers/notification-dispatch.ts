import { NotificationRepository } from '../../notifications/notification.repository';
import { defineHandler, InvalidPayloadError } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';

export interface DispatchDeps {
	readonly notifications: NotificationRepository;
}

/**
 * `notification.dispatch` of tech.md 7.2: sends one row over its channel and marks it. Mail left
 * the event channels in v1.49 and the push driver arrives in C15, so until then no channel is live:
 * a row that still reaches the queue is marked failed and the job dies instead of retrying.
 */
export function createNotificationDispatchHandler(deps: DispatchDeps) {
	return defineHandler({
		topic: 'notification.dispatch',
		schema: JOB_PAYLOAD_SCHEMAS['notification.dispatch'],
		async handle({ notificationId }) {
			const row = deps.notifications.forDispatch(notificationId);
			if (!row) throw new InvalidPayloadError(`notification ${notificationId} not found`);
			if (row.status === 'sent') return;
			const reason = `channel ${row.channel} is not live`;
			deps.notifications.markFailed(row.id, row.attempts + 1, reason);
			throw new InvalidPayloadError(reason);
		}
	});
}

export const notificationDispatchHandler = createNotificationDispatchHandler({
	notifications: new NotificationRepository()
});
