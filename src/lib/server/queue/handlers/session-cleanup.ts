import { SessionCleanupRepository } from '../../auth/session-cleanup.repository';
import { withTransaction } from '../../core/tx';
import { PushSubscriptionRepository } from '../../notifications/push-subscription.repository';
import { defineHandler } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';

export const sessionCleanupHandler = defineHandler({
	topic: 'session.cleanup',
	schema: JOB_PAYLOAD_SCHEMAS['session.cleanup'],
	async handle(_payload, ctx) {
		const removed = withTransaction((tx) => ({
			...new SessionCleanupRepository().purgeExpired(ctx.now, tx),
			// Dispatch marks a device the push service refused for good; the row is dropped here.
			pushSubscriptions: new PushSubscriptionRepository().purgeExpired(tx)
		}));
		ctx.logger.info(removed, 'expired sessions, reset tokens and push subscriptions purged');
	}
});
