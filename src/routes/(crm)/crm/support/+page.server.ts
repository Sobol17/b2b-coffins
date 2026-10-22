import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { SupportThreadService } from '$lib/server/support/support-thread.service';
import { supportFiltersSchema } from '$lib/validation/support';
import type { SupportThreadFilters } from '$lib/types/support';
import { definedProps } from '$lib/utils/props';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'support.any');
	const service = new SupportThreadService(actor);
	// A crafted query string is input like any other: the filters go through Zod before the service.
	const parsed = supportFiltersSchema.parse(Object.fromEntries(url.searchParams));
	const filters: SupportThreadFilters = definedProps(parsed);
	return {
		threads: service.list(parseListQuery<SupportThreadFilters>(url, filters)),
		counterparties: service.counterpartyChoices()
	};
};
