import { requireAction, requireScope } from '$lib/server/auth/guard';
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
		}
	};
};
