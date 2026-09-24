import { redirect } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import { CrmRequestCardService } from '$lib/server/crm-request/crm-request-card.service';
import { CrmRequestCreateService } from '$lib/server/crm-request/crm-request-create.service';
import { requestIdSchema } from '$lib/validation/request';
import { crmRequestCreateForm, crmRequestCreateSchema } from '$lib/validation/crm-request';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function actorOf(event: Pick<RequestEvent, 'locals' | 'url'>) {
	return requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'request.create'
	);
}

export const load: PageServerLoad = (event) => {
	const service = new CrmRequestCardService(actorOf(event));
	// The addresses follow the counterparty picked in the form, which reloads the page with its id.
	const picked = requestIdSchema.safeParse(event.url.searchParams.get('counterpartyId'));
	return {
		choices: service.choices(),
		counterpartyId: picked.success ? picked.data : null,
		addresses: picked.success ? service.addresses(picked.data) : []
	};
};

export const actions = {
	default: async (event) => {
		const actor = actorOf(event);
		const parsed = crmRequestCreateSchema.safeParse(
			crmRequestCreateForm(await event.request.formData())
		);
		if (!parsed.success) return invalidForm(parsed.error);
		let id: number;
		try {
			id = new CrmRequestCreateService(actor).create(parsed.data).id;
		} catch (err) {
			return actionFailure(err);
		}
		redirect(303, `/crm/requests/${id}`);
	}
} satisfies Actions;
