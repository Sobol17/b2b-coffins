import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CatalogService } from '$lib/server/catalog/catalog.service';
import { actionFailure, invalidForm, orNotFound } from '$lib/server/core/http';
import { DraftService } from '$lib/server/request/draft.service';
import { productIdSchema } from '$lib/validation/catalog';
import { addDraftItemSchema, draftItemForm } from '$lib/validation/request';
import type { Actions, PageServerLoad } from './$types';

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

export const actions = {
	// Layout guards do not run for actions, so the action checks the contour and the right itself.
	add: async ({ request, locals, url }) => {
		const actor = requireAction(
			requireScope(locals.actor, 'portal', url.pathname),
			'request.create'
		);
		const parsed = addDraftItemSchema.safeParse(draftItemForm(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { added: true, unitCount: new DraftService(actor).addItem(parsed.data).unitCount };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
