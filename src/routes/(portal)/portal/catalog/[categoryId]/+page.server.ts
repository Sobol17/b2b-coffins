import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CatalogService } from '$lib/server/catalog/catalog.service';
import { orNotFound } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import {
	catalogFiltersFromUrl,
	catalogSortFromUrl,
	categoryIdSchema
} from '$lib/validation/catalog';
import type { PageServerLoad } from './$types';

const PER_PAGE_OPTIONS = [12, 24, 48] as const;

export const load: PageServerLoad = ({ locals, url, params }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'catalog.read');
	const categoryId = categoryIdSchema.safeParse(params.categoryId);
	if (!categoryId.success) error(404, { code: 'not_found', message: 'Раздел не найден' });

	const service = new CatalogService(actor);
	const view = orNotFound(() => service.category(categoryId.data), 'Раздел не найден');
	const filters = catalogFiltersFromUrl(url);
	const base = parseListQuery(url, { ...filters, categoryId: categoryId.data });
	const query = {
		...base,
		perPage: PER_PAGE_OPTIONS.find((size) => size === base.perPage) ?? PER_PAGE_OPTIONS[0],
		sort: catalogSortFromUrl(url)
	};

	return {
		view,
		filters,
		facets: service.facets(categoryId.data),
		products: service.list(query),
		sort: query.sort,
		dir: query.dir ?? 'asc',
		perPageOptions: PER_PAGE_OPTIONS
	};
};
