import { requireAction, requireScope } from '$lib/server/auth/guard';
import { actionFailure, invalidForm, orNotFound } from '$lib/server/core/http';
import { RequestCardService } from '$lib/server/request/request-card.service';
import { RequestCommentService } from '$lib/server/request/request-comment.service';
import { RequestTransitionService } from '$lib/server/request/request-transition.service';
import {
	requestCommentSchema,
	requestIdSchema,
	requestTransitionSchema
} from '$lib/validation/request';
import type { ActorContext } from '$lib/types/actor';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function reader(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'portal', url.pathname), 'request.read.own');
}

export const load: PageServerLoad = ({ locals, params, url }) => {
	const actor = reader(locals, url);
	const id = requestIdSchema.parse(params.id);
	return { request: orNotFound(() => new RequestCardService(actor).card(id), 'Заявка не найдена') };
};

export const actions = {
	comment: async ({ locals, params, request, url }) => {
		const actor = reader(locals, url);
		const parsed = requestCommentSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			const posted = new RequestCommentService(actor).add(
				requestIdSchema.parse(params.id),
				parsed.data
			);
			return { action: 'comment' as const, posted };
		} catch (err) {
			return actionFailure(err);
		}
	},

	/** Cancelling is a status move, so it goes through the state machine like every other one. */
	cancel: async ({ locals, params, request, url }) => {
		const actor = reader(locals, url);
		const form = Object.fromEntries(await request.formData());
		const parsed = requestTransitionSchema.safeParse({ ...form, to: 'cancelled' });
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			const moved = new RequestTransitionService(actor).move(
				requestIdSchema.parse(params.id),
				parsed.data
			);
			return { action: 'cancel' as const, moved };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
