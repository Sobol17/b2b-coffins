import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { InventoryService } from '$lib/server/crm-stock/inventory.service';
import { routeId, stockActor } from '$lib/server/crm-stock/route';
import { inventorySaveSchema } from '$lib/validation/crm-stock';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function context(event: RequestEvent) {
	return {
		id: routeId(event.params.id, 'Инвентаризация не найдена'),
		request: event.request,
		service: new InventoryService(stockActor(event))
	};
}

export const load: PageServerLoad = (event) => {
	const { id, service } = context(event);
	return { card: orHttpStatus(() => service.card(id)) };
};

export const actions = {
	save: (event) => {
		const { id, request, service } = context(event);
		return formAction(request, 'save', inventorySaveSchema, (input) => service.save(id, input));
	},
	// The counted figures travel with the click, so «Провести» never applies a stale draft.
	apply: (event) => {
		const { id, request, service } = context(event);
		return formAction(request, 'apply', inventorySaveSchema, (input) => service.apply(id, input));
	},
	remove: (event) => {
		const { id, request, service } = context(event);
		// The page of a deleted draft is gone, so the answer is the list.
		return formAction(request, 'remove', z.object({}), () => {
			service.remove(id);
			redirect(303, '/crm/stock/inventories');
		});
	}
} satisfies Actions;
