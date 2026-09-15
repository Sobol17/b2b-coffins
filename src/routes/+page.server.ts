import { redirect } from '@sveltejs/kit';
import { OrgService } from '$lib/server/settings/org.service';
import type { PageServerLoad } from './$types';

// The root serves the public landing page to a guest and routes a signed-in user to the contour.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.actor) redirect(303, locals.actor.scope === 'crm' ? '/crm' : '/portal');
	// Guests get contacts only: nothing from the catalog, prices or counterparties reaches this page.
	return { contacts: OrgService.publicContacts() };
};
