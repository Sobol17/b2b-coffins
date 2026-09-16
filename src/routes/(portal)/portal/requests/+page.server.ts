import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { RequestRegistryService } from '$lib/server/request/request-registry.service';
import { requestFiltersFrom, requestFiltersSchema } from '$lib/validation/request';
import type { RequestFilters } from '$lib/types/request';
import { definedProps } from '$lib/utils/props';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(
		requireScope(locals.actor, 'portal', url.pathname),
		'request.read.own'
	);
	// A crafted query string is input like any other: the filters go through Zod before the service.
	const parsed = requestFiltersSchema.parse(requestFiltersFrom(url.searchParams));
	const filters: RequestFilters = {
		statuses: parsed.statuses,
		...definedProps({ from: parsed.from, to: parsed.to })
	};
	return {
		requests: new RequestRegistryService(actor).list(parseListQuery<RequestFilters>(url, filters))
	};
};
