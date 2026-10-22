import { redirect } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction } from '$lib/server/core/http';
import { SupportPostingService } from '$lib/server/support/support-posting.service';
import { SupportThreadService } from '$lib/server/support/support-thread.service';
import { supportOpenSchema, supportThreadIdSchema } from '$lib/validation/support';
import type { ActorContext } from '$lib/types/actor';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function writer(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'portal', url.pathname), 'support.own');
}

export const load: PageServerLoad = ({ locals, url }) => {
	const options = new SupportThreadService(writer(locals, url)).requestOptions();
	// A request outside the select is dropped quietly: the link may come from somewhere stale.
	const asked = supportThreadIdSchema.safeParse(url.searchParams.get('request'));
	const requestId =
		asked.success && options.some((option) => option.id === asked.data) ? asked.data : null;
	return { options, requestId };
};

export const actions = {
	open: async ({ locals, request, url }) => {
		const actor = writer(locals, url);
		const outcome = await formAction(request, 'open', supportOpenSchema, (input) =>
			new SupportPostingService(actor).open(input)
		);
		if ('result' in outcome) redirect(303, `/portal/support/${outcome.result.id}`);
		return outcome;
	}
} satisfies Actions;
