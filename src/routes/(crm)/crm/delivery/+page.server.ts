import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { DeliveryService } from '$lib/server/crm-delivery/delivery.service';
import { RequestTransitionService } from '$lib/server/request/request-transition.service';
import {
	deliveryDoneSchema,
	deliveryLoadSchema,
	deliveryUnloadSchema
} from '$lib/validation/crm-delivery';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function actorOf(event: Pick<RequestEvent, 'locals' | 'url'>) {
	const actor = requireScope(event.locals.actor, 'crm', event.url.pathname);
	return requireAction(actor, 'delivery.work');
}

export const load: PageServerLoad = (event) => {
	const actor = actorOf(event);
	return { delivery: orHttpStatus(() => new DeliveryService(actor).overview()) };
};

export const actions = {
	load: (event) => {
		const actor = actorOf(event);
		return formAction(event.request, 'load', deliveryLoadSchema, (input) =>
			new DeliveryService(actor).load(input)
		);
	},
	unload: (event) => {
		const actor = actorOf(event);
		return formAction(event.request, 'unload', deliveryUnloadSchema, (input) =>
			new DeliveryService(actor).unload(input)
		);
	},
	// The delivery is the move of tech.md 6.2: the state machine and guard fullyLoaded decide.
	deliver: (event) => {
		const actor = actorOf(event);
		return formAction(event.request, 'deliver', deliveryDoneSchema, (input) =>
			new RequestTransitionService(actor).deliver(input.requestId, input.cashCollected)
		);
	}
} satisfies Actions;
