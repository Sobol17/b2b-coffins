import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { ShopService } from '$lib/server/crm-shop/shop.service';
import { RequestTransitionService } from '$lib/server/request/request-transition.service';
import { shopAssembleSchema, shopProduceSchema, shopSearchSchema } from '$lib/validation/crm-shop';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and both rights.
function actorOf(event: Pick<RequestEvent, 'locals' | 'url'>) {
	const actor = requireScope(event.locals.actor, 'crm', event.url.pathname);
	return requireAction(requireAction(actor, 'request.read.any'), 'stock.manage');
}

export const load: PageServerLoad = (event) => {
	const actor = actorOf(event);
	const search = shopSearchSchema.parse(event.url.searchParams.get('q') ?? undefined);
	return {
		search: search ?? '',
		shop: orHttpStatus(() => new ShopService(actor).overview(search))
	};
};

export const actions = {
	produce: (event) => {
		const actor = actorOf(event);
		return formAction(event.request, 'produce', shopProduceSchema, (input) =>
			new ShopService(actor).produce(input)
		);
	},
	// The assembly is the move of tech.md 6.2: the state machine and guard stockCovered decide.
	assemble: (event) => {
		const actor = actorOf(event);
		return formAction(event.request, 'assemble', shopAssembleSchema, ({ requestId }) =>
			new RequestTransitionService(actor).move(requestId, {
				to: 'ready',
				reasonId: null,
				comment: null
			})
		);
	}
} satisfies Actions;
