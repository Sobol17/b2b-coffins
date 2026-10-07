import { withTransaction } from '../../core/tx';
import type { Tx } from '../../db/client';
import { NotificationFeedRepository } from '../../notifications/notification-feed.repository';
import { NotificationRuleRepository } from '../../notifications/notification-rule.repository';
import { NotificationRepository, type Person } from '../../notifications/notification.repository';
import { PushSubscriptionRepository } from '../../notifications/push-subscription.repository';
import { SettingsRepository } from '../../settings/settings.repository';
import { defineHandler } from '../job-handler';
import { Queue } from '../queue';
import { JOB_PAYLOAD_SCHEMAS, jobKey } from '../topics';
import {
	channelChoices,
	isAddressed,
	receives,
	rolesTowardsRequest,
	workshopRolesTowards,
	type RoleRule
} from '$lib/domain/notification/matrix';
import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';
import { LIVE_CHANNELS } from '$lib/types/notifications';
import type { RoleCode } from '$lib/types/roles';
import { notificationsEnabledSchema } from '$lib/validation/settings';

export interface FanoutDeps {
	readonly rules: NotificationRuleRepository;
	readonly notifications: NotificationRepository;
	readonly subscriptions: Pick<PushSubscriptionRepository, 'hasLive'>;
	readonly isEnabled: () => boolean;
	readonly feed?: NotificationFeedRepository;
}

/** One person and the roles they hold towards this very event. */
interface Addressee {
	readonly person: Person;
	readonly roles: readonly RoleCode[];
}

interface Occurrence {
	readonly eventKey: EventKey;
	readonly entityId: number;
}

/** What one event needs to know once, whoever it is told to. */
interface Plan {
	readonly rules: readonly RoleRule[];
	readonly hasPushText: boolean;
}

/**
 * `notification.fanout` of tech.md 7.2: turns one event into the in-app feed row of every
 * addressee and into `notifications` rows by the role matrix and personal settings, with one
 * dispatch queued per channel row in the same transaction. A push row goes only to a person with
 * a live device (v1.50). Portal people hear about the requests of their counterparty, workshop
 * people about every event of tech.md 7.3 (v1.49).
 */
export function createNotificationFanoutHandler(deps: FanoutDeps) {
	const feed = deps.feed ?? new NotificationFeedRepository();
	return defineHandler({
		topic: 'notification.fanout',
		schema: JOB_PAYLOAD_SCHEMAS['notification.fanout'],
		async handle(event, ctx) {
			if (!deps.isEnabled()) {
				ctx.logger.info({ eventKey: event.eventKey }, 'notifications are switched off');
				return;
			}
			const counts = withTransaction((tx) => {
				const plan = {
					rules: deps.rules.rules(event.eventKey, tx),
					hasPushText: deps.rules.activeTemplate(event.eventKey, 'push', tx) !== undefined
				};
				return addresseesOf(event, tx).map((addressee) => fanOutTo(addressee, event, plan, tx));
			});
			const created = counts.reduce((sum, count) => sum + count, 0);
			ctx.logger.info({ ...event, people: counts.length, created }, 'notification fanout done');
		}
	});

	function addresseesOf(event: Occurrence, tx: Tx): Addressee[] {
		const workshop = deps.notifications.crmPeople(tx);
		if (!REQUEST_EVENT_KEYS.includes(event.eventKey)) {
			// Stock and payroll are the workshop's own business: the portal never hears of them.
			return workshop.map((person) => ({ person, roles: person.roles }));
		}
		const request = deps.notifications.requestFacts(event.entityId, tx);
		if (!request) return [];
		// A stock request has no counterparty and so nobody in the portal to tell.
		const { counterpartyId, createdById } = request;
		const portal =
			counterpartyId === null ? [] : deps.notifications.portalPeople(counterpartyId, tx);
		return [
			...portal.map((person) => ({
				person,
				roles: rolesTowardsRequest(person.roles, createdById === person.userId)
			})),
			...workshop.map((person) => ({
				person,
				roles: workshopRolesTowards(person.roles, counterpartyId === null)
			}))
		];
	}

	function fanOutTo(
		{ person, roles }: Addressee,
		{ eventKey, entityId }: Occurrence,
		{ rules, hasPushText }: Plan,
		tx: Tx
	): number {
		// The feed is a mirror of events, not a channel: personal switches do not reach it (v1.33).
		if (isAddressed(rules, roles, eventKey)) {
			feed.insert({ userId: person.userId, eventKey, entityId }, tx);
		}
		const choices = channelChoices(
			rules,
			roles,
			deps.rules.prefsOf(person.userId, tx),
			LIVE_CHANNELS
		);
		let created = 0;
		for (const channel of LIVE_CHANNELS) {
			if (!receives(choices, eventKey, channel)) continue;
			// A push nobody can receive is not a delivery: without a device or a text there is no row.
			const reachable = hasPushText && deps.subscriptions.hasLive(person.userId, tx);
			if (channel === 'push' && !reachable) continue;
			const key = { eventKey, entityId, userId: person.userId, channel };
			// A rerun after a crash between commit and `done` must not notify the person twice.
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
	subscriptions: new PushSubscriptionRepository(),
	isEnabled: () => {
		const parsed = notificationsEnabledSchema.safeParse(
			new SettingsRepository().findValue('notifications.enabled')
		);
		// A missing or broken switch keeps events flowing: silence is the harder failure to notice.
		return parsed.success ? parsed.data : true;
	}
});
