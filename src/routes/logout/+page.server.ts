import { redirect } from '@sveltejs/kit';
import { AuditService } from '$lib/server/audit/audit.service';
import { clearSessionCookie } from '$lib/server/auth/cookies';
import { SESSION_COOKIE, SessionService } from '$lib/server/auth/session.service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/login');

export const actions = {
	default: ({ cookies, locals }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) SessionService.destroy(token);
		clearSessionCookie(cookies);

		if (locals.actor) {
			AuditService.record({
				actorId: locals.actor.userId,
				action: 'auth.logout',
				entity: 'users',
				entityId: locals.actor.userId,
				requestId: locals.requestId
			});
		}
		redirect(303, '/login');
	}
} satisfies Actions;
