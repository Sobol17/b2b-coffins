import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CharityBannerService } from '$lib/server/charity/charity-banner.service';
import { RequestRegistryService } from '$lib/server/request/request-registry.service';
import { RequestRepeatService } from '$lib/server/request/request-repeat.service';
import type { PageServerLoad } from './$types';

/** How many active requests the home page shows before it sends the reader to the registry. */
const ACTIVE_ON_HOME = 5;

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'request.create');
	return {
		lastRequest: new RequestRepeatService(actor).lastSent(),
		activeRequests: new RequestRegistryService(actor).active(ACTIVE_ON_HOME),
		charity: new CharityBannerService(actor).banner()
	};
};
