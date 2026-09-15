import { requireAction, requireScope } from '$lib/server/auth/guard';
import { RequestRepeatService } from '$lib/server/request/request-repeat.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'request.create');
	return { lastRequest: new RequestRepeatService(actor).lastSent() };
};
