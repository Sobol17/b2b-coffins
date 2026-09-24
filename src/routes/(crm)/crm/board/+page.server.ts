import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction } from '$lib/server/core/http';
import { CrmRequestListService } from '$lib/server/crm-request/crm-request-list.service';
import { RequestTransitionService } from '$lib/server/request/request-transition.service';
import { boardMoveSchema, crmRequestFiltersSchema } from '$lib/validation/crm-request';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function actorOf(event: Pick<RequestEvent, 'locals' | 'url'>) {
	return requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'request.read.any'
	);
}

export const load: PageServerLoad = (event) => {
	const service = new CrmRequestListService(actorOf(event));
	const search = event.url.searchParams.get('search') ?? undefined;
	return {
		board: service.board({
			filters: crmRequestFiltersSchema.parse(Object.fromEntries(event.url.searchParams)),
			...(search === undefined || search === '' ? {} : { search })
		}),
		counterparties: service.counterparties()
	};
};

export const actions = {
	// A dropped card asks the state machine; a refused move comes back to its column.
	move: (event) => {
		const actor = actorOf(event);
		return formAction(event.request, 'move', boardMoveSchema, (input) =>
			new RequestTransitionService(actor).move(input.id, input)
		);
	}
} satisfies Actions;
