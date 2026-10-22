import { and, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	seedNotificationRules,
	seedNotificationTemplates,
	syncNotificationFixtures
} from '../../scripts/seed/reference';
import { notificationRules, notificationTemplates } from '../../src/lib/server/db/schema';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

describe('notifications:sync on a stand without the seed (v1.57)', () => {
	it('adds missing rules and templates and keeps what the owner changed', () => {
		seedNotificationRules(db);
		seedNotificationTemplates(db);
		// A stand from before v1.57: no support rows yet, and the owner changed two things.
		db.delete(notificationRules).where(like(notificationRules.eventKey, 'support.%')).run();
		db.delete(notificationTemplates).where(like(notificationTemplates.eventKey, 'support.%')).run();
		const managerReady = and(
			eq(notificationRules.eventKey, 'request.ready'),
			eq(notificationRules.roleCode, 'manager'),
			eq(notificationRules.channel, 'push')
		);
		db.update(notificationRules).set({ enabled: false }).where(managerReady).run();
		db.update(notificationTemplates)
			.set({ body: 'Свой текст' })
			.where(eq(notificationTemplates.eventKey, 'request.ready'))
			.run();

		// 3 events x (manager, owner) + 2 events x (cp_admin, cp_employee) = 10 rules
		expect(syncNotificationFixtures(db)).toEqual({ rules: 10, templates: 3 });

		expect(db.select().from(notificationRules).where(managerReady).all()[0]?.enabled).toBe(false);
		const [ready] = db
			.select()
			.from(notificationTemplates)
			.where(eq(notificationTemplates.eventKey, 'request.ready'))
			.all();
		expect(ready?.body).toBe('Свой текст');
		expect(syncNotificationFixtures(db)).toEqual({ rules: 0, templates: 0 });
	});
});
