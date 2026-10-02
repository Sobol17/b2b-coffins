import { redirect } from '@sveltejs/kit';
import { formAction } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { canManageStock, stockActor } from '$lib/server/crm-stock/route';
import { StockItemService } from '$lib/server/crm-stock/stock-item.service';
import { stockFiltersSchema, stockItemCreateSchema } from '$lib/validation/crm-stock';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const actor = stockActor(event);
	const service = new StockItemService(actor);
	const filters = stockFiltersSchema.parse(Object.fromEntries(event.url.searchParams));
	return {
		items: service.list(parseListQuery(event.url, filters)),
		choices: service.choices(),
		canManage: canManageStock(actor)
	};
};

export const actions = {
	create: (event) => {
		const service = new StockItemService(stockActor(event));
		// A new item opens on its card: the first move is usually the next click.
		return formAction(event.request, 'create', stockItemCreateSchema, (input) =>
			redirect(303, `/crm/stock/${service.create(input)}`)
		);
	}
} satisfies Actions;
