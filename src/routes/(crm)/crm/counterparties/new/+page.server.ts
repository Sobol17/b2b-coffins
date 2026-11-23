import { redirect } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction } from '$lib/server/core/http';
import { CrmCounterpartyService } from '$lib/server/crm-counterparty/crm-counterparty.service';
import { createCounterpartySchema } from '$lib/validation/crm-counterparty';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function actorOf(locals: App.Locals, url: URL) {
	return requireAction(requireScope(locals.actor, 'crm', url.pathname), 'counterparty.manage');
}

export const load: PageServerLoad = ({ locals, url }) => ({
	choices: new CrmCounterpartyService(actorOf(locals, url)).choices()
});

export const actions = {
	create: async ({ request, locals, url }) => {
		const service = new CrmCounterpartyService(actorOf(locals, url));
		return formAction(request, 'create', createCounterpartySchema, (input) =>
			redirect(303, `/crm/counterparties/${service.create(input)}`)
		);
	}
} satisfies Actions;
