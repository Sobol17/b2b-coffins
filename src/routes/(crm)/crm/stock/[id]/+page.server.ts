import { redirect } from '@sveltejs/kit';
import { requireAction } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { routeId, stockActor } from '$lib/server/crm-stock/route';
import { StockItemService } from '$lib/server/crm-stock/stock-item.service';
import { StockMoveService } from '$lib/server/crm-stock/stock-move.service';
import {
	stockItemUpdateSchema,
	stockItemDeleteSchema,
	stockJournalFiltersSchema,
	stockMoveSchema,
	stockReverseSchema
} from '$lib/validation/crm-stock';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function context(event: RequestEvent) {
	const actor = stockActor(event);
	return {
		actor,
		id: routeId(event.params.id, 'Позиция не найдена'),
		request: event.request,
		items: () => new StockItemService(actor),
		moves: () => new StockMoveService(actor)
	};
}

export const load: PageServerLoad = (event) => {
	const { id, items, moves } = context(event);
	const filters = stockJournalFiltersSchema.parse(Object.fromEntries(event.url.searchParams));
	return orHttpStatus(() => ({
		card: items().card(id),
		choices: items().choices(),
		journal: moves().journal(id, parseListQuery(event.url, filters))
	}));
};

export const actions = {
	delete: (event) => {
		const { actor, id, request, items } = context(event);
		requireAction(actor, 'stock.manage');
		return formAction(
			request,
			'delete',
			stockItemDeleteSchema,
			({ modelId }) => {
				items().archive(id, modelId ?? null);
				redirect(303, '/crm/stock');
			},
			{ stockItemId: id }
		);
	},
	update: (event) => {
		const { id, request, items } = context(event);
		return formAction(request, 'update', stockItemUpdateSchema, (input) =>
			items().update(id, input)
		);
	},
	move: (event) => {
		const { id, request, moves } = context(event);
		return formAction(request, 'move', stockMoveSchema, (input) => moves().create(id, input));
	},
	reverse: (event) => {
		const { id, request, moves } = context(event);
		return formAction(request, 'reverse', stockReverseSchema, ({ moveId }) =>
			moves().reverse(id, moveId)
		);
	}
} satisfies Actions;
