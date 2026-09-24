import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { CrmRequestCardService } from '$lib/server/crm-request/crm-request-card.service';
import { CrmRequestPriorityService } from '$lib/server/crm-request/crm-request-priority.service';
import { CrmRequestItemsService } from '$lib/server/crm-request/crm-request-items.service';
import { RequestTransitionService } from '$lib/server/request/request-transition.service';
import {
	addLineSchema,
	lineQtySchema,
	prioritySchema,
	removeLineSchema
} from '$lib/validation/crm-request';
import { requestIdSchema, requestTransitionSchema } from '$lib/validation/request';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function context(event: RequestEvent) {
	const parsed = requestIdSchema.safeParse(event.params.id);
	if (!parsed.success) error(404, { code: 'not_found', message: 'Заявка не найдена' });
	const actor = requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'request.read.any'
	);
	return {
		id: parsed.data,
		request: event.request,
		priorities: () => new CrmRequestPriorityService(actor),
		items: () => new CrmRequestItemsService(actor),
		moves: () => new RequestTransitionService(actor),
		cards: () => new CrmRequestCardService(actor)
	};
}

export const load: PageServerLoad = (event) => {
	const { id, cards } = context(event);
	const service = cards();
	return orHttpStatus(() => ({ card: service.card(id), choices: service.choices() }));
};

export const actions = {
	move: (event) => {
		const { id, moves, request } = context(event);
		return formAction(request, 'move', requestTransitionSchema, (input) => moves().move(id, input));
	},
	priority: (event) => {
		const { id, priorities, request } = context(event);
		return formAction(request, 'priority', prioritySchema, (input) =>
			priorities().setPriority(id, input.priority)
		);
	},
	addLine: (event) => {
		const { id, items, request } = context(event);
		return formAction(request, 'addLine', addLineSchema, (input) => items().addLine(id, input));
	},
	setQty: (event) => {
		const { id, items, request } = context(event);
		return formAction(request, 'setQty', lineQtySchema, (input) => items().setQty(id, input));
	},
	removeLine: (event) => {
		const { id, items, request } = context(event);
		return formAction(request, 'removeLine', removeLineSchema, (input) =>
			items().removeLine(id, input)
		);
	}
} satisfies Actions;
