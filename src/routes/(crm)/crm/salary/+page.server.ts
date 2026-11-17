import { requireAction, requireScope } from '$lib/server/auth/guard';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	requireAction(requireScope(locals.actor, 'crm', url.pathname), 'crm.access');
	redirect(303, resolve('/crm'));
};
