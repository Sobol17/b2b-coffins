import { config } from '../../config';
import type { MailDriver } from '../../notifications/drivers/mail';
import { mailDriver } from '../../notifications/drivers/mail/select';
import { NotificationRuleRepository } from '../../notifications/notification-rule.repository';
import {
	NotificationRepository,
	type DispatchRow,
	type RequestFacts
} from '../../notifications/notification.repository';
import { defineHandler, InvalidPayloadError } from '../job-handler';
import { JOB_PAYLOAD_SCHEMAS } from '../topics';
import { renderTemplate, type TemplateValues } from '$lib/domain/notification/template';
import { REQUEST_STATUS_META } from '$lib/ui/status';

export interface DispatchDeps {
	readonly rules: NotificationRuleRepository;
	readonly notifications: NotificationRepository;
	readonly mail: () => MailDriver;
	readonly origin: string;
	readonly clock?: () => Date;
}

/** Values the templates may use. Money never goes out: one text serves roles with and without prices. */
export function requestValues(request: RequestFacts, origin: string): TemplateValues {
	return {
		number: request.number,
		status: REQUEST_STATUS_META[request.status].label,
		url: `${origin}/portal/requests/${request.id}`,
		counterparty: request.counterpartyName ?? 'заявка на склад',
		externalNumber: request.externalNumber ?? 'не указан'
	};
}

/**
 * `notification.dispatch` of tech.md 7.2: sends one row over its channel and marks it. The text is
 * built from the database at send time, so a retry mails the status the request has now.
 */
export function createNotificationDispatchHandler(deps: DispatchDeps) {
	return defineHandler({
		topic: 'notification.dispatch',
		schema: JOB_PAYLOAD_SCHEMAS['notification.dispatch'],
		async handle({ notificationId }, ctx) {
			const row = deps.notifications.forDispatch(notificationId);
			if (!row) throw new InvalidPayloadError(`notification ${notificationId} not found`);
			if (row.status === 'sent') return;

			const attempts = row.attempts + 1;
			const message = compose(row);
			try {
				await deps.mail().send(message);
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				deps.notifications.markFailed(row.id, attempts, reason);
				throw err;
			}
			deps.notifications.markSent(row.id, attempts, deps.clock?.() ?? new Date());
			ctx.logger.info({ notificationId, eventKey: row.eventKey }, 'notification sent');
		}
	});

	/** Push rows cannot exist before C15; a missing text or request cannot be fixed by a retry. */
	function compose(row: DispatchRow) {
		const refuse = (reason: string): never => {
			deps.notifications.markFailed(row.id, row.attempts + 1, reason);
			throw new InvalidPayloadError(reason);
		};
		if (row.channel !== 'email') return refuse(`channel ${row.channel} is not live`);
		const template = deps.rules.activeTemplate(row.eventKey, row.channel);
		if (!template) return refuse(`no active template for ${row.eventKey}`);
		const request = deps.notifications.requestFacts(row.entityId);
		if (!request) return refuse(`request ${row.entityId} not found`);

		const values = requestValues(request, deps.origin);
		return {
			to: row.email,
			subject: renderTemplate(template.subject ?? '{{number}}', values),
			text: renderTemplate(template.body, values)
		};
	}
}

export const notificationDispatchHandler = createNotificationDispatchHandler({
	rules: new NotificationRuleRepository(),
	notifications: new NotificationRepository(),
	mail: mailDriver,
	origin: config.ORIGIN
});
