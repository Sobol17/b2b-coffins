import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { CrmRequestListService } from '$lib/server/crm-request/crm-request-list.service';
import { crmRequestFiltersSchema } from '$lib/validation/crm-request';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'request.read.any');
	const service = new CrmRequestListService(actor);
	const filters = crmRequestFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return {
		requests: service.list(parseListQuery(url, filters)),
		counterparties: service.counterparties()
	};
};
