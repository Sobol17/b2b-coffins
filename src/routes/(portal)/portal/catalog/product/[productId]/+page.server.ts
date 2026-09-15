import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CatalogService } from '$lib/server/catalog/catalog.service';
import { orNotFound } from '$lib/server/core/http';
import { productIdSchema } from '$lib/validation/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url, params }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'catalog.read');
	const productId = productIdSchema.safeParse(params.productId);
	if (!productId.success) error(404, { code: 'not_found', message: 'Позиция не найдена' });

	const service = new CatalogService(actor);
	const product = orNotFound(() => service.get(productId.data), 'Позиция не найдена');
	const categoryId = product.categoryId;

	return {
		product,
		path:
			categoryId === null
				? []
				: orNotFound(() => service.category(categoryId), 'Раздел не найден').path,
		similar: service.similar(product.id)
	};
};
