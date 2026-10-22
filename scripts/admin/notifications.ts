import type { Db } from '../../src/lib/server/db/client';
import { syncNotificationFixtures } from '../seed/reference';

/**
 * Adds the push rules and templates of new events to a stand that never runs the seed. Run after
 * the deploy; a second run changes nothing.
 */
export function notificationsSync(db: Db): void {
	const added = db.transaction(() => syncNotificationFixtures(db));
	console.log(JSON.stringify(added));
}
