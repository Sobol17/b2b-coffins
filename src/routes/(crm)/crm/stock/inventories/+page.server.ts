import { redirect } from '@sveltejs/kit';
import { formAction } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { InventoryService } from '$lib/server/crm-stock/inventory.service';
import { canManageStock, stockActor } from '$lib/server/crm-stock/route';
import { inventoryCreateSchema } from '$lib/validation/crm-stock';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const actor = stockActor(event);
	return {
		inventories: new InventoryService(actor).list(parseListQuery(event.url)),
		canManage: canManageStock(actor)
	};
};

export const actions = {
	create: (event) => {
		const service = new InventoryService(stockActor(event));
		// A new draft opens at once: counting is the next step.
		return formAction(event.request, 'create', inventoryCreateSchema, (input) =>
			redirect(303, `/crm/stock/inventories/${service.create(input)}`)
		);
	}
} satisfies Actions;
