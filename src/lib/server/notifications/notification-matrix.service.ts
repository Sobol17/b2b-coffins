import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import { NotificationRuleRepository } from './notification-rule.repository';
import type { ActorContext } from '$lib/types/actor';
import type { NotificationRuleCellDto } from '$lib/types/crm-notifications';
import { LIVE_CHANNELS } from '$lib/types/notifications';

/** The matrix «event × role × channel» of tech.md 7.3 as the owner reads it: the seed writes it. */
export class NotificationMatrixService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly rules: NotificationRuleRepository = new NotificationRuleRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError without `settings.manage`. */
	cells(): NotificationRuleCellDto[] {
		this.assert(PolicyService.can(this.ctx, 'settings.manage'), 'settings.manage');
		return this.rules.rules().map((rule) => ({
			eventKey: rule.eventKey,
			roleCode: rule.roleCode,
			channel: rule.channel,
			enabled: rule.enabled,
			isLive: LIVE_CHANNELS.includes(rule.channel)
		}));
	}
}
