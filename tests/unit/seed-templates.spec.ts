import { describe, expect, it } from 'vitest';
import { seedNotificationTemplates } from '../../scripts/seed/reference';
import { notificationTemplateFixture } from '../../scripts/seed/schema';
import { notificationTemplates } from '../../src/lib/server/db/schema';
import { EVENT_KEYS } from '../../src/lib/types/events';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

describe('seed of push templates (C15)', () => {
	it('writes one push template per event and keeps an edited text on a rerun', () => {
		expect(seedNotificationTemplates(db)).toBe(EVENT_KEYS.length);
		db.update(notificationTemplates).set({ body: 'Свой текст' }).run();

		seedNotificationTemplates(db);

		const rows = db.select().from(notificationTemplates).all();
		expect(rows.map((row) => row.eventKey).sort()).toEqual([...EVENT_KEYS].sort());
		expect(rows.every((row) => row.channel === 'push' && row.body === 'Свой текст')).toBe(true);
	});

	it('refuses a fixture row with a variable of another event', () => {
		const row = {
			eventKey: 'payroll.week_closed',
			channel: 'push',
			subject: 'Неделя',
			body: '{{number}}'
		};
		expect(notificationTemplateFixture.safeParse(row).success).toBe(false);
	});
});
