import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { DictCode } from '../../src/lib/types/dicts';
import type { Db } from '../../src/lib/server/db/client';
import {
	dictItems,
	notificationRules,
	notificationTemplates,
	numberingSequences,
	roles,
	settings
} from '../../src/lib/server/db/schema';
import {
	dictFixture,
	loadFixture,
	notificationRuleFixture,
	notificationTemplateFixture,
	numberingFixture,
	roleFixture
} from './schema';

export function seedRoles(db: Db): number {
	const rows = loadFixture('roles.json', z.array(roleFixture));
	for (const row of rows) {
		db.insert(roles)
			.values(row)
			.onConflictDoUpdate({ target: roles.code, set: { title: row.title } })
			.run();
	}
	return rows.length;
}

export function seedDicts(db: Db): number {
	const rows = loadFixture('dicts.json', z.array(dictFixture));
	for (const row of rows) {
		db.insert(dictItems)
			.values({ ...row, isActive: true })
			.onConflictDoUpdate({
				target: [dictItems.dict, dictItems.code],
				set: { title: row.title, sortOrder: row.sortOrder }
			})
			.run();
	}
	return rows.length;
}

// Keys the core dropped: the CRM IP filter left the system in v1.37 (tech.md 5.9).
const RETIRED_SETTINGS = ['crm.ip_allowlist'];

export function seedSettings(db: Db): number {
	const rows = loadFixture('settings.json', z.record(z.string(), z.unknown()));
	const entries = Object.entries(rows);
	db.delete(settings).where(inArray(settings.key, RETIRED_SETTINGS)).run();
	for (const [key, value] of entries) {
		// Settings are operator-owned after the first run: seed inserts, it never overwrites.
		db.insert(settings).values({ key, value }).onConflictDoNothing().run();
	}
	return entries.length;
}

export function seedNumbering(db: Db): number {
	const rows = loadFixture('numbering.json', z.array(numberingFixture));
	for (const row of rows) {
		// Never reset lastValue: re-running the seed must not hand out a duplicate request number.
		db.insert(numberingSequences).values(row).onConflictDoNothing().run();
	}
	return rows.length;
}

export function seedNotificationRules(db: Db): number {
	const rows = loadFixture('notification-rules.json', z.array(notificationRuleFixture));
	for (const row of rows) {
		db.insert(notificationRules)
			.values(row)
			.onConflictDoUpdate({
				target: [notificationRules.eventKey, notificationRules.roleCode, notificationRules.channel],
				set: { enabled: row.enabled }
			})
			.run();
	}
	return rows.length;
}

export function seedNotificationTemplates(db: Db): number {
	const rows = loadFixture('notification-templates.json', z.array(notificationTemplateFixture));
	for (const row of rows) {
		// Operator-owned after the first run, like settings: C12 edits the texts in the CRM.
		db.insert(notificationTemplates).values(row).onConflictDoNothing().run();
	}
	return rows.length;
}

export function dictIdByCode(db: Db, dict: DictCode, code: string): number {
	const [row] = db
		.select({ id: dictItems.id })
		.from(dictItems)
		.where(and(eq(dictItems.dict, dict), eq(dictItems.code, code)))
		.all();
	if (!row) throw new Error(`dict item ${dict}.${code} is missing, seed dictionaries first`);
	return row.id;
}
