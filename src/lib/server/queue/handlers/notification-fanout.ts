import { withTransaction } from '../../core/tx';
import type { Tx } from '../../db/client';
import { NotificationRuleRepository } from '../../notifications/notification-rule.repository';
import {
	NotificationRepository,
	type Person,
	type RequestFacts
} from '../../notifications/notification.repository';
import { SettingsRepository } from '../../settings/settings.repository';
import { defineHandler } from '../job-handler';
import { Queue } from '../queue';
import { JOB_PAYLOAD_SCHEMAS, jobKey } from '../topics';
import {
	channelChoices,
	receives,
	rolesTowardsRequest,
	type RoleRule
} from '$lib/domain/notification/matrix';
import type { EventKey } from '$lib/types/events';
import { LIVE_CHANNELS } from '$lib/types/notifications';
import { notificationsEnabledSchema } from '$lib/validation/settings';

export interface FanoutDeps {
	readonly rules: NotificationRuleRepository;
	readonly notifications: NotificationRepository;
	readonly isEnabled: () => boolean;
}

/** Request events of tech.md 7.3. Stock and payroll events find their people in C8, C10 and C12. */
function isRequestEvent(eventKey: EventKey): boolean {
	return eventKey.startsWith('request.');
}

/**
 * `notification.fanout` of tech.md 7.2: turns one event into `notifications` rows by the role
 * matrix and personal settings, and queues one dispatch per row in the same transaction. P9 finds
 * the portal people of the request; the workshop roles join in C12.
 */
export function createNotificationFanoutHandler(deps: FanoutDeps) {
	return defineHandler({
		topic: 'notification.fanout',
		schema: JOB_PAYLOAD_SCHEMAS['notification.fanout'],
		async handle({ eventKey, entityId }, ctx) {
			if (!deps.isEnabled()) {
				ctx.logger.info({ eventKey }, 'notifications are switched off');
				return;
			}
			if (!isRequestEvent(eventKey)) return;

			const created = withTransaction((tx) => {
				const request = deps.notifications.requestFacts(entityId, tx);
				// A stock request has no counterparty and so nobody in the portal to tell.
				if (!request || request.counterpartyId === null) return 0;
				const rules = deps.rules.rules(eventKey, tx);
				const people = deps.notifications.portalPeople(request.counterpartyId, tx);
				return people.reduce(
					(sum, person) => sum + fanOutTo(person, request, rules, eventKey, tx),
					0
				);
			});
			ctx.logger.info({ eventKey, entityId, created }, 'notification fanout done');
		}
	});

	function fanOutTo(
		person: Person,
		request: RequestFacts,
		rules: readonly RoleRule[],
		eventKey: EventKey,
		tx: Tx
	): number {
		const roles = rolesTowardsRequest(person.roles, request.createdById === person.userId);
		const choices = channelChoices(
			rules,
			roles,
			deps.rules.prefsOf(person.userId, tx),
			LIVE_CHANNELS
		);
		let created = 0;
		for (const channel of LIVE_CHANNELS) {
			if (!receives(choices, eventKey, channel)) continue;
			const key = { eventKey, entityId: request.id, userId: person.userId, channel };
			// A rerun after a crash between commit and `done` must not mail the person twice.
			if (deps.notifications.exists(key, tx)) continue;
			const id = deps.notifications.insert(key, tx);
			Queue.enqueue('notification.dispatch', { notificationId: id }, jobKey.dispatch(id), tx);
			created += 1;
		}
		return created;
	}
}

export const notificationFanoutHandler = createNotificationFanoutHandler({
	rules: new NotificationRuleRepository(),
	notifications: new NotificationRepository(),
	isEnabled: () => {
		const parsed = notificationsEnabledSchema.safeParse(
			new SettingsRepository().findValue('notifications.enabled')
		);
		// A missing or broken switch keeps mail flowing: silence is the harder failure to notice.
		return parsed.success ? parsed.data : true;
	}
});
