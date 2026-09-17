import { PolicyService } from '../auth/policy';
import { NotFoundError, ValidationError } from '../core/errors';
import { normalizeListQuery } from '../core/list';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { ProfileRepository } from '../profile/profile.repository';
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
import { LIVE_CHANNELS, type NotificationSettingsDto } from '$lib/types/notifications';
import type { NotificationPrefsInput } from '$lib/validation/notifications';

/** Personal notification settings and the delivery log of a portal user (P9). */
export class NotificationSettingsService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly rules: NotificationRuleRepository = new NotificationRuleRepository(),
		private readonly log: NotificationRepository = new NotificationRepository(),
		private readonly profiles: ProfileRepository = new ProfileRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError outside the portal, NotFoundError when the account is filtered out. */
	settings(query: Partial<ListQuery> = {}): NotificationSettingsDto {
		this.assert(PolicyService.can(this.ctx, 'portal.access'), 'portal.access');
		const profile = this.profiles.findOwn(this.ctx);
		if (!profile) throw new NotFoundError('profile');

		const { page, perPage } = normalizeListQuery(query);
		const log = this.log.logPage(this.ctx, perPage, (page - 1) * perPage);
		return {
			email: profile.email,
			prefs: this.offered().map(NotificationDtoMapper.toPref),
			log: { rows: log.rows.map(NotificationDtoMapper.toLogItem), total: log.total, page, perPage }
		};
	}

	/**
	 * Stores the switches of the form. Every offered pair gets a row, so a later change of the role
	 * rule leaves the user's choice alone.
	 * @throws ForbiddenError outside the portal, ValidationError for a pair the user is not offered.
	 */
	save(input: NotificationPrefsInput): NotificationSettingsDto['prefs'] {
		this.assert(PolicyService.can(this.ctx, 'portal.access'), 'portal.access');
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

	private offered(tx?: Tx): ChannelChoice[] {
		return channelChoices(
			this.rules.rules(undefined, tx),
			this.ctx.roles,
			this.rules.prefsOf(this.ctx.userId, tx),
			LIVE_CHANNELS
		);
	}
}
