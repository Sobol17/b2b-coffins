import { error, json } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { rethrowAsHttp } from '$lib/server/core/http';
import { SiteSearchService } from '$lib/server/search/site-search.service';
import type { SiteSearchDto } from '$lib/types/search';
import { siteSearchQuerySchema } from '$lib/validation/search';
import type { RequestHandler } from './$types';

// The portal layout does not run for an endpoint, so the contour is checked here.
export const GET: RequestHandler = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'portal.access');
	const query = siteSearchQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!query.success)
		error(400, { code: 'validation_failed', message: 'Введите не меньше двух букв' });

	let found: SiteSearchDto;
	try {
		found = new SiteSearchService(actor).find(query.data.q);
	} catch (err) {
		rethrowAsHttp(err);
	}
	return json(found, { headers: { 'cache-control': 'private, no-store' } });
};
