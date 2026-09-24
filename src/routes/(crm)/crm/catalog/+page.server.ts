import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CrmCatalogService } from '$lib/server/crm-catalog/crm-catalog.service';
import { parseListQuery } from '$lib/server/core/list';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import { productInputSchema } from '$lib/validation/crm-catalog';
import type { Actions, PageServerLoad } from './$types';

function service(locals: App.Locals, url: URL): CrmCatalogService {
	return new CrmCatalogService(
		requireAction(requireScope(locals.actor, 'crm', url.pathname), 'catalog.manage')
	);
}

export const load: PageServerLoad = ({ locals, url }) => {
	const catalog = service(locals, url);
	const query = parseListQuery(url);
	const term = query.search?.toLocaleLowerCase('ru') ?? '';
	const matching = catalog
		.listProducts()
		.filter((row) => `${row.sku} ${row.title}`.toLocaleLowerCase('ru').includes(term));
	const order = query.sort === 'title' ? 'title' : 'sku';
	matching.sort((a, b) => (query.dir === 'desc' ? -1 : 1) * a[order].localeCompare(b[order], 'ru'));
	return {
		categories: catalog.listCategories(),
		products: {
			rows: matching.slice((query.page - 1) * query.perPage, query.page * query.perPage),
			total: matching.length,
			page: query.page,
			perPage: query.perPage
		}
	};
};

export const actions = {
	create: async ({ request, locals, url }) => {
		const catalog = service(locals, url);
		const parsed = productInputSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { product: catalog.createProduct(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
