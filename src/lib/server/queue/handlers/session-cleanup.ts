import { SessionCleanupRepository } from '../../auth/session-cleanup.repository';
import { withTransaction } from '../../core/tx';
import { defineHandler } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';

export const sessionCleanupHandler = defineHandler({
	topic: 'session.cleanup',
	schema: JOB_PAYLOAD_SCHEMAS['session.cleanup'],
	async handle(_payload, ctx) {
		const removed = withTransaction((tx) =>
			new SessionCleanupRepository().purgeExpired(ctx.now, tx)
		);
		// Dead push subscriptions become known only when the real push driver reports 404 or 410,
		// which arrives with C15; until then this job has nothing to revoke there.
		ctx.logger.info(removed, 'expired sessions and reset tokens purged');
	}
});
