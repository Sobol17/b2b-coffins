import { PolicyService } from '../auth/policy';
import { config } from '../config';
import type { Tx } from '../db/client';
import { OrgService } from '../settings/org.service';
import type { PushMessage } from './drivers/push';
import { NotificationRuleRepository } from './notification-rule.repository';
import { NotificationRepository } from './notification.repository';
import { PushFactsRepository, type RecipientFacts } from './push-facts.repository';
import { clip } from '$lib/domain/notification/delivery';
import { eventPath, type Audience } from '$lib/domain/notification/link';
import { renderTemplate, type TemplateValues } from '$lib/domain/notification/template';
import { REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';
import { REQUEST_STATUS_META } from '$lib/ui/status';
import { formatDate, isoDay } from '$lib/utils/format';

export const PUSH_TITLE_MAX = 80;
export const PUSH_BODY_MAX = 200;

export interface PushMessageDeps {
	readonly templates: NotificationRuleRepository;
	readonly requests: NotificationRepository;
	readonly facts: PushFactsRepository;
	readonly timeZone: () => string;
	readonly origin: string;
}

export interface PushText {
	readonly title: string;
	readonly body: string;
}

interface Scene {
	readonly values: TemplateValues;
	readonly path: string;
}

/** Builds the push of one `notifications` row from the database at send time (tech.md 7.1, 17.3). */
export class PushMessageService {
	private readonly deps: PushMessageDeps;

	constructor(deps: Partial<PushMessageDeps> = {}) {
		this.deps = {
			templates: deps.templates ?? new NotificationRuleRepository(),
			requests: deps.requests ?? new NotificationRepository(),
			facts: deps.facts ?? new PushFactsRepository(),
			timeZone: deps.timeZone ?? (() => OrgService.timezone()),
			origin: deps.origin ?? config.ORIGIN
		};
	}

	/** Null when the template is off or the person or the entity is gone: nothing to send. */
	build(
		row: { eventKey: EventKey; entityId: number; userId: number },
		tx?: Tx
	): PushMessage | null {
		const template = this.deps.templates.activeTemplate(row.eventKey, 'push', tx);
		const recipient = this.deps.facts.recipient(row.userId, tx);
		if (!template || !recipient) return null;
		const scene = this.scene(row.eventKey, row.entityId, recipient, tx);
		if (!scene) return null;
		const text = { title: template.subject ?? '', body: template.body };
		return {
			...this.render(row.eventKey, text, scene.values),
			url: scene.path,
			tag: `${row.eventKey}:${row.entityId}`
		};
	}

	/** A rendered text is clipped, not refused: a long counterparty name must not lose the push. */
	render(eventKey: EventKey, text: PushText, values: TemplateValues): PushText {
		return {
			title: clip(renderTemplate(eventKey, text.title, values), PUSH_TITLE_MAX),
			body: clip(renderTemplate(eventKey, text.body, values), PUSH_BODY_MAX)
		};
	}

	private scene(key: EventKey, id: number, to: RecipientFacts, tx?: Tx): Scene | null {
		if (REQUEST_EVENT_KEYS.includes(key)) return this.requestScene(key, id, to, tx);
		return key === 'stock.below_threshold' ? this.stockScene(id, tx) : this.weekScene(id, tx);
	}

	private requestScene(key: EventKey, id: number, to: RecipientFacts, tx?: Tx): Scene | null {
		const request = this.deps.requests.requestFacts(id, tx);
		if (!request) return null;
		const path = eventPath(key, id, audienceOf(to));
		return {
			path,
			values: {
				number: request.number,
				status: REQUEST_STATUS_META[request.status].label,
				url: this.deps.origin + path,
				// A stock request has no counterparty: the workshop orders for its own shelf.
				counterparty: request.counterpartyName ?? 'Склад',
				externalNumber: request.externalNumber ?? ''
			}
		};
	}

	private stockScene(id: number, tx?: Tx): Scene | null {
		const item = this.deps.facts.stockItem(id, tx);
		if (!item) return null;
		const path = eventPath('stock.below_threshold', id, 'crm_registry');
		return {
			path,
			values: {
				item: item.title,
				code: item.code,
				balance: String(item.balance),
				threshold: String(item.minThreshold),
				unit: item.unit,
				url: this.deps.origin + path
			}
		};
	}

	private weekScene(id: number, tx?: Tx): Scene | null {
		const week = this.deps.facts.week(id, tx);
		if (!week) return null;
		const zone = this.deps.timeZone();
		const start = week.startsOn.toISOString();
		const path = eventPath('payroll.week_closed', id, 'crm_registry', isoDay(start, zone));
		return {
			path,
			values: {
				period: `${formatDate(start, zone)} по ${formatDate(week.endsOn.toISOString(), zone)}`,
				url: this.deps.origin + path
			}
		};
	}
}

function audienceOf(recipient: RecipientFacts): Audience {
	if (recipient.scope === 'portal') return 'portal';
	return PolicyService.can(recipient, 'request.read.any') ? 'crm_registry' : 'crm_floor';
}
