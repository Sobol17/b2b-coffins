import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CatalogService } from '$lib/server/catalog/catalog.service';
import { actionFailure, invalidForm, orNotFound } from '$lib/server/core/http';
import { DraftService } from '$lib/server/request/draft.service';
import type { ActorContext } from '$lib/types/actor';
import { productIdSchema } from '$lib/validation/catalog';
import {
	addDraftItemSchema,
	draftItemForm,
	draftItemQtySchema,
	draftItemSchema
} from '$lib/validation/request';
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
		similar: service.similar(product.id),
		draftLines: new DraftService(actor).linesOf(product.id)
	};
};

// Layout guards do not run for actions, so every action checks the contour and the right itself.
function orderer(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'portal', url.pathname), 'request.create');
}

export const actions = {
	add: async ({ request, locals, url }) => {
		const service = new DraftService(orderer(locals, url));
		const parsed = addDraftItemSchema.safeParse(draftItemForm(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { added: true, unitCount: service.addItem(parsed.data).unitCount };
		} catch (err) {
			return actionFailure(err);
		}
	},

	// The counter of a model already in the draft runs the same line operations as the cart.
	qty: async ({ request, locals, url }) => {
		const service = new DraftService(orderer(locals, url));
		const parsed = draftItemQtySchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { unitCount: service.setQty(parsed.data.itemId, parsed.data.qty).unitCount };
		} catch (err) {
			return actionFailure(err);
		}
	},

	remove: async ({ request, locals, url }) => {
		const service = new DraftService(orderer(locals, url));
		const parsed = draftItemSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { removed: true, unitCount: service.removeItem(parsed.data.itemId).unitCount };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
