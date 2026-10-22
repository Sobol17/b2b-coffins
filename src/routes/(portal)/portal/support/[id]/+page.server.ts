import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { SupportPostingService } from '$lib/server/support/support-posting.service';
import { SupportThreadService } from '$lib/server/support/support-thread.service';
import { supportPostSchema, supportThreadIdSchema } from '$lib/validation/support';
import type { ActorContext } from '$lib/types/actor';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function member(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'portal', url.pathname), 'support.own');
}

export const load: PageServerLoad = ({ locals, params, url }) => {
	const actor = member(locals, url);
	const id = supportThreadIdSchema.parse(params.id);
	return { thread: orHttpStatus(() => new SupportThreadService(actor).thread(id)) };
};

export const actions = {
	post: async ({ locals, params, request, url }) => {
		const actor = member(locals, url);
		const id = supportThreadIdSchema.parse(params.id);
		return formAction(request, 'post', supportPostSchema, (input) =>
			new SupportPostingService(actor).post(id, input)
		);
	},

	close: async ({ locals, params, request, url }) => {
		const actor = member(locals, url);
		const id = supportThreadIdSchema.parse(params.id);
		return formAction(request, 'close', z.object({}), () =>
			new SupportPostingService(actor).close(id)
		);
	}
} satisfies Actions;
