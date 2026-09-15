import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CatalogService } from '$lib/server/catalog/catalog.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'catalog.read');
	const groups = new CatalogService(actor).showcase();
	return {
		groups,
		total: groups.reduce((sum, group) => sum + group.category.productCount, 0)
	};
};
