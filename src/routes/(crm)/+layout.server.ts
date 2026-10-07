import { requireAction, requireScope } from '$lib/server/auth/guard';
import { PolicyService } from '$lib/server/auth/policy';
import { NotificationFeedService } from '$lib/server/notifications/notification-feed.service';
import { PushSubscriptionService } from '$lib/server/notifications/push-subscription.service';
import { OrgService } from '$lib/server/settings/org.service';
import { SIDEBAR_COOKIE_NAME } from '$lib/ui/base/sidebar/constants';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url, cookies }) => {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	requireAction(actor, 'crm.access');

	return {
		user: {
			fullName: locals.user?.fullName ?? '',
			scope: actor.scope,
			roles: actor.roles,
			canSeePrices: actor.canSeePrices
		},
		timezone: OrgService.timezone(),
		// The sidebar writes its fold state itself; reading it here keeps the first paint in place.
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false',
		// The bell counts on every navigation: tech.md 7.4 has no personal stream to push it (v1.49).
		bell: new NotificationFeedService(actor).bell(),
		// The public key and the device count: the client offers push on this device from them.
		push: new PushSubscriptionService(actor).state(),
		// Navigation only: every page and action checks its own right on the server again.
		can: {
			requests: PolicyService.can(actor, 'request.read.any'),
			shop:
				PolicyService.can(actor, 'request.read.any') && PolicyService.can(actor, 'stock.manage'),
			delivery: PolicyService.can(actor, 'delivery.work'),
			stock: PolicyService.can(actor, 'stock.read'),
			payroll: PolicyService.can(actor, 'payroll.read'),
			reports: PolicyService.can(actor, 'reports.read'),
			catalog: PolicyService.can(actor, 'catalog.manage'),
			counterparties: PolicyService.can(actor, 'counterparty.manage'),
			settings: PolicyService.can(actor, 'settings.manage'),
			audit: PolicyService.can(actor, 'audit.read')
		}
	};
};
