import { redirect } from '@sveltejs/kit';
import { LandingService } from '$lib/server/landing/landing.service';
import { OrgService } from '$lib/server/settings/org.service';
import type { PageServerLoad } from './$types';

// The root serves the public landing page to a guest and routes a signed-in user to the contour.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.actor) redirect(303, locals.actor.scope === 'crm' ? '/crm' : '/portal');
	const landing = new LandingService();
	// Contacts, covers of published models and the fund. Prices, stock and counters stay inside.
	return {
		contacts: OrgService.publicContacts(),
		works: landing.works(),
		charity: landing.charity()
	};
};
