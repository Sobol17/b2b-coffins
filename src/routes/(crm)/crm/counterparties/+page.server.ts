import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { CrmCounterpartyService } from '$lib/server/crm-counterparty/crm-counterparty.service';
import { counterpartyFiltersSchema } from '$lib/validation/crm-counterparty';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(
		requireScope(locals.actor, 'crm', url.pathname),
		'counterparty.manage'
	);
	const service = new CrmCounterpartyService(actor);
	const filters = counterpartyFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return {
		counterparties: service.list(parseListQuery(url, filters)),
		choices: service.choices()
	};
};
