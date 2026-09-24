import { requireAction, requireScope } from '$lib/server/auth/guard';
import { PolicyService } from '$lib/server/auth/policy';
import { OrgService } from '$lib/server/settings/org.service';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
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
		// Navigation only: every page and action checks its own right on the server again.
		can: {
			catalog: PolicyService.can(actor, 'catalog.manage'),
			counterparties: PolicyService.can(actor, 'counterparty.manage'),
			settings: PolicyService.can(actor, 'settings.manage'),
			audit: PolicyService.can(actor, 'audit.read')
		}
	};
};
