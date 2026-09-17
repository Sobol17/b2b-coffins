import { and, eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { notificationRules, notificationTemplates, userNotificationPrefs } from '../db/schema';
import type { PersonalPref, RoleRule } from '$lib/domain/notification/matrix';
import type { EventKey } from '$lib/types/events';
import type { NotificationChannel } from '$lib/types/notifications';

export interface TemplateRow {
	readonly subject: string | null;
	readonly body: string;
}

/** The matrix of tech.md 7.3: role rules, personal overrides and the texts behind them. */
export class NotificationRuleRepository extends BaseRepository<typeof notificationRules> {
	constructor() {
		super(notificationRules);
	}

	rules(eventKey?: EventKey, tx?: Tx): RoleRule[] {
		return this.db(tx)
			.select()
			.from(notificationRules)
			.where(eventKey === undefined ? undefined : eq(notificationRules.eventKey, eventKey))
			.all();
	}

	prefsOf(userId: number, tx?: Tx): PersonalPref[] {
		return this.db(tx)
			.select({
				eventKey: userNotificationPrefs.eventKey,
				channel: userNotificationPrefs.channel,
				enabled: userNotificationPrefs.enabled
			})
			.from(userNotificationPrefs)
			.where(eq(userNotificationPrefs.userId, userId))
			.all();
	}

	/** One row per offered pair; the caller runs it in the transaction of the save. */
	upsertPrefs(userId: number, prefs: readonly PersonalPref[], tx: Tx): void {
		for (const pref of prefs) {
			tx.insert(userNotificationPrefs)
				.values({ userId, ...pref })
				.onConflictDoUpdate({
					target: [
						userNotificationPrefs.userId,
						userNotificationPrefs.eventKey,
						userNotificationPrefs.channel
					],
					set: { enabled: pref.enabled }
				})
				.run();
		}
	}

	activeTemplate(
		eventKey: EventKey,
		channel: NotificationChannel,
		tx?: Tx
	): TemplateRow | undefined {
		const [row] = this.db(tx)
			.select({ subject: notificationTemplates.subject, body: notificationTemplates.body })
			.from(notificationTemplates)
			.where(
				and(
					eq(notificationTemplates.eventKey, eventKey),
					eq(notificationTemplates.channel, channel),
					eq(notificationTemplates.isActive, true)
				)
			)
			.all();
		return row;
	}
}
