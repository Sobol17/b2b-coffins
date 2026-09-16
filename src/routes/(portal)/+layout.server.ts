import { requireAction, requireScope } from '$lib/server/auth/guard';
import { PolicyService } from '$lib/server/auth/policy';
import { CounterpartyService } from '$lib/server/counterparty/counterparty.service';
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
		// Menu hints only: every page and action checks the right again on the server.
		canManageStaff: PolicyService.can(actor, 'counterparty.staff.manage'),
		canManagePrices: PolicyService.can(actor, 'prices.manage')
	};
};
