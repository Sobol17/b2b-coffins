import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The PWA start_url is `/`; the server decides which contour the account belongs to.
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.actor) redirect(303, '/login');
	redirect(303, locals.actor.scope === 'crm' ? '/crm' : '/portal');
};
