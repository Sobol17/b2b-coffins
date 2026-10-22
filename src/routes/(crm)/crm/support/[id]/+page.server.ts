import { z } from 'zod';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { PolicyService } from '$lib/server/auth/policy';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { SupportPostingService } from '$lib/server/support/support-posting.service';
import { SupportThreadService } from '$lib/server/support/support-thread.service';
import { supportPostSchema, supportThreadIdSchema } from '$lib/validation/support';
import type { ActorContext } from '$lib/types/actor';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function answerer(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'crm', url.pathname), 'support.any');
}

export const load: PageServerLoad = ({ locals, params, url }) => {
	const actor = answerer(locals, url);
	const id = supportThreadIdSchema.parse(params.id);
	return {
		thread: orHttpStatus(() => new SupportThreadService(actor).thread(id)),
		// Links only: the counterparty card and the request card check their own rights again.
		canOpenCounterparty: PolicyService.can(actor, 'counterparty.manage'),
		canOpenRequest: PolicyService.can(actor, 'request.read.any')
	};
};

export const actions = {
	post: async ({ locals, params, request, url }) => {
		const actor = answerer(locals, url);
		const id = supportThreadIdSchema.parse(params.id);
		return formAction(request, 'post', supportPostSchema, (input) =>
			new SupportPostingService(actor).post(id, input)
		);
	},

	close: async ({ locals, params, request, url }) => {
		const actor = answerer(locals, url);
		const id = supportThreadIdSchema.parse(params.id);
		return formAction(request, 'close', z.object({}), () =>
			new SupportPostingService(actor).close(id)
		);
	}
} satisfies Actions;
