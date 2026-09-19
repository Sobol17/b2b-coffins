import { requireAction, requireScope } from '$lib/server/auth/guard';
import { PolicyService } from '$lib/server/auth/policy';
import { CounterpartyService } from '$lib/server/counterparty/counterparty.service';
import { NotificationFeedService } from '$lib/server/notifications/notification-feed.service';
import { DraftService } from '$lib/server/request/draft.service';
import { OrgService } from '$lib/server/settings/org.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	const actor = requireScope(locals.actor, 'portal', url.pathname);
	requireAction(actor, 'portal.access');

	return {
		user: {
			fullName: locals.user?.fullName ?? '',
			scope: actor.scope,
			roles: actor.roles,
			canSeePrices: actor.canSeePrices
		},
		counterparty: new CounterpartyService(actor).summary(),
		timezone: OrgService.timezone(),
		cartUnits: new DraftService(actor).unitCount(),
		// The bell counts on every navigation: tech.md 7.4 has no personal stream to push it (v1.33).
		bell: new NotificationFeedService(actor).bell(),
		// Menu hints only: every page and action checks the right again on the server.
		canManageStaff: PolicyService.can(actor, 'counterparty.staff.manage'),
		canManagePrices: PolicyService.can(actor, 'prices.manage')
	};
};
