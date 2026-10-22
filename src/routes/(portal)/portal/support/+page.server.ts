import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { SupportThreadService } from '$lib/server/support/support-thread.service';
import type { SupportThreadFilters } from '$lib/types/support';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'support.own');
	return {
		threads: new SupportThreadService(actor).list(parseListQuery<SupportThreadFilters>(url, {}))
	};
};
