import { notInArray } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import {
	notificationRules,
	notificationTemplates,
	notifications,
	userNotificationPrefs
} from '../../src/lib/server/db/schema';
import { NOTIFICATION_CHANNELS } from '../../src/lib/types/notifications';

/**
 * v1.49 took mail out of the event channels. SQLite has no CHECK on `channel`, so a database filled
 * earlier keeps the mail rows; the seed is the one place that touches every such database.
 * @returns how many retired rows were removed.
 */
export function retireMailChannel(db: Db): number {
	const live = [...NOTIFICATION_CHANNELS];
	return db.transaction((tx) => {
		const removed = [
			tx.delete(notifications).where(notInArray(notifications.channel, live)).run(),
			tx.delete(userNotificationPrefs).where(notInArray(userNotificationPrefs.channel, live)).run(),
			tx.delete(notificationTemplates).where(notInArray(notificationTemplates.channel, live)).run(),
			tx.delete(notificationRules).where(notInArray(notificationRules.channel, live)).run()
		];
		return removed.reduce((sum, result) => sum + result.changes, 0);
	});
}
