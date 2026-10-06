import { contourAccess, PolicyService } from '../auth/policy';
import { ValidationError } from '../core/errors';
import { normalizeListQuery } from '../core/list';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { NotificationDtoMapper } from './dto';
import { NotificationRuleRepository } from './notification-rule.repository';
import { NotificationRepository } from './notification.repository';
import {
	channelChoices,
	prefKey,
	prefsFromSelection,
	type ChannelChoice
} from '$lib/domain/notification/matrix';
import type { ActorContext } from '$lib/types/actor';
import type { ListQuery } from '$lib/types/list';
import { NOTIFICATION_CHANNELS, type NotificationSettingsDto } from '$lib/types/notifications';
import type { NotificationPrefsInput } from '$lib/validation/notifications';

/** Personal notification settings and the delivery log of a user of either contour (P9, C12). */
export class NotificationSettingsService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly rules: NotificationRuleRepository = new NotificationRuleRepository(),
		private readonly log: NotificationRepository = new NotificationRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError for an actor without a contour of its own. */
	settings(query: Partial<ListQuery> = {}): NotificationSettingsDto {
		this.assertContour();
		const { page, perPage } = normalizeListQuery(query);
		const log = this.log.logPage(this.ctx, perPage, (page - 1) * perPage);
		return {
			prefs: this.offered().map(NotificationDtoMapper.toPref),
			log: { rows: log.rows.map(NotificationDtoMapper.toLogItem), total: log.total, page, perPage }
		};
	}

	/**
	 * Stores the switches of the form. Every offered pair gets a row, so a later change of the role
	 * rule leaves the user's choice alone.
	 * @throws ForbiddenError without a contour, ValidationError for a pair the user is not offered.
	 */
	save(input: NotificationPrefsInput): NotificationSettingsDto['prefs'] {
		this.assertContour();
		return this.audited({ action: 'notifications.prefs.update', entity: 'users' }, (tx) => {
			const offered = this.offered(tx);
			const known = new Set(offered.map((choice) => prefKey(choice.eventKey, choice.channel)));
			const selected = new Set(input.enabled);
			if ([...selected].some((key) => !known.has(key))) {
				throw new ValidationError('Такой настройки уведомлений нет', { field: 'enabled' });
			}

			const prefs = prefsFromSelection(offered, selected);
			this.rules.upsertPrefs(this.ctx.userId, prefs, tx);
			return {
				result: this.offered(tx).map(NotificationDtoMapper.toPref),
				entityId: this.ctx.userId,
				after: { enabled: [...selected].sort() }
			};
		});
	}

	/** The settings are personal: each contour opens them by its own access right (v1.49). */
	private assertContour(): void {
		const action = contourAccess(this.ctx);
		this.assert(PolicyService.can(this.ctx, action), action);
	}

	/**
	 * Every channel the matrix names for the roles of the user, not only the ones a driver sends
	 * over today: push is chosen here before C15 wires it, MAX before C16. The fanout still sends
	 * over `LIVE_CHANNELS` alone, so a switch ahead of its driver promises nothing.
	 */
	private offered(tx?: Tx): ChannelChoice[] {
		return channelChoices(
			this.rules.rules(undefined, tx),
			this.ctx.roles,
			this.rules.prefsOf(this.ctx.userId, tx),
			NOTIFICATION_CHANNELS
		);
	}
}
