import { PolicyService } from '../auth/policy';
import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { PushDriver } from './drivers/push';
import { pushDriver } from './drivers/push/select';
import { PushMessageService } from './push-message.service';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { PushTemplateRepository, type PushTemplateText } from './push-template.repository';
import {
	EVENT_TEMPLATE_VARIABLES,
	TEMPLATE_SAMPLES,
	unknownVariables
} from '$lib/domain/notification/template';
import type { ActorContext } from '$lib/types/actor';
import { EVENT_KEYS, type EventKey } from '$lib/types/events';
import type { NotificationTemplateDto, NotificationTemplatePreviewDto } from '$lib/types/push';
import type { PushTemplateInput } from '$lib/validation/push';

const TEMPLATES_PATH = '/crm/settings/notifications/templates';

export interface PushTemplateDeps {
	readonly templates: PushTemplateRepository;
	readonly subscriptions: PushSubscriptionRepository;
	readonly messages: Pick<PushMessageService, 'render'>;
	readonly driver: () => PushDriver;
}

/** The push texts the owner edits (C15). The matrix beside them stays seed-owned. */
export class PushTemplateService extends BaseService {
	private readonly deps: PushTemplateDeps;

	constructor(ctx: ActorContext, deps: Partial<PushTemplateDeps> = {}) {
		super(ctx);
		this.deps = {
			templates: deps.templates ?? new PushTemplateRepository(),
			subscriptions: deps.subscriptions ?? new PushSubscriptionRepository(),
			messages: deps.messages ?? new PushMessageService(),
			driver: deps.driver ?? pushDriver
		};
	}

	/**
	 * One line per event, in flow order; an event without a row comes empty and switched off.
	 * @throws ForbiddenError without `settings.manage`.
	 */
	list(): NotificationTemplateDto[] {
		this.assertManage();
		const rows = new Map(this.deps.templates.all().map((row) => [row.eventKey, row]));
		return EVENT_KEYS.map((eventKey) => toDto(eventKey, rows.get(eventKey)));
	}

	/** @throws ValidationError for a variable the event does not offer. */
	save(input: PushTemplateInput): NotificationTemplateDto {
		this.assertManage();
		this.assertVariables(input);
		return this.audited(
			{ action: 'notifications.template.update', entity: 'notification_templates' },
			(tx) => {
				const before = this.deps.templates.find(input.eventKey, tx);
				const after = { subject: input.title, body: input.body, isActive: input.isActive };
				const id = this.deps.templates.upsert(input.eventKey, after, tx);
				return {
					result: toDto(input.eventKey, after),
					entityId: id,
					...(before ? { before: textOf(before) } : {}),
					after
				};
			}
		);
	}

	/** The text on sample values: nothing is read from a request, so nothing can leak into it. */
	preview(input: PushTemplateInput): NotificationTemplatePreviewDto {
		this.assertManage();
		this.assertVariables(input);
		return this.deps.messages.render(input.eventKey, input, TEMPLATE_SAMPLES[input.eventKey]);
	}

	/**
	 * Sends the preview to the devices of the actor, past the delivery log: `notifications` holds
	 * events only. Returns how many devices took it.
	 * @throws ValidationError when the actor has no live device or none of them took the push.
	 */
	async sendTest(input: PushTemplateInput): Promise<number> {
		const text = this.preview(input);
		const targets = this.deps.subscriptions.liveOf(this.ctx.userId);
		if (targets.length === 0) {
			throw new ValidationError('Включите уведомления на этом устройстве', { field: 'eventKey' });
		}
		const message = { ...text, url: TEMPLATES_PATH, tag: `test:${input.eventKey}` };
		const results = await Promise.allSettled(
			targets.map((target) => this.deps.driver().send(target, message))
		);
		const delivered = results.filter((result) => result.status === 'fulfilled').length;
		if (delivered === 0) {
			throw new ValidationError('Сервис доставки не принял уведомление', { field: 'eventKey' });
		}
		return delivered;
	}

	private assertManage(): void {
		this.assert(PolicyService.can(this.ctx, 'settings.manage'), 'settings.manage');
	}

	private assertVariables(input: PushTemplateInput): void {
		const unknown = unknownVariables(input.eventKey, `${input.title} ${input.body}`);
		if (unknown.length === 0) return;
		throw new ValidationError(`Переменной нет у этого события: ${unknown.join(', ')}`, {
			field: 'body'
		});
	}
}

function textOf(row: PushTemplateText): Record<string, unknown> {
	return { subject: row.subject, body: row.body, isActive: row.isActive };
}

function toDto(eventKey: EventKey, row: PushTemplateText | undefined): NotificationTemplateDto {
	return {
		eventKey,
		channel: 'push',
		title: row?.subject ?? '',
		body: row?.body ?? '',
		isActive: row?.isActive ?? false,
		variables: EVENT_TEMPLATE_VARIABLES[eventKey]
	};
}
