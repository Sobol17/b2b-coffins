import { fail, redirect } from '@sveltejs/kit';
import { AuthService } from '$lib/server/auth/auth.service';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { SESSION_TTL_DAYS } from '$lib/server/auth/session.service';
import { AppError, userMessage } from '$lib/server/core/errors';
import { mailDriver } from '$lib/server/notifications/drivers/mail/select';
import { loginSchema } from '$lib/validation/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.actor) redirect(303, locals.actor.scope === 'crm' ? '/crm' : '/portal');
	return { redirectTo: url.searchParams.get('redirectTo') ?? '' };
};

export const actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const parsed = loginSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { errors: parsed.error.flatten().fieldErrors });

		const service = new AuthService(undefined, mailDriver());
		let result;
		try {
			result = await service.login(parsed.data, {
				ip: getClientAddress(),
				userAgent: request.headers.get('user-agent')
			});
		} catch (err) {
			if (!(err instanceof AppError)) throw err;
			// One message for a wrong password and for an unknown address: no account enumeration.
			return fail(422, { formError: userMessage(err), email: parsed.data.email });
		}

		setSessionCookie(
			cookies,
			result.token,
			new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
		);

		if (result.mustChangePassword) redirect(303, '/password/change');

		const home = result.scope === 'crm' ? '/crm' : '/portal';
		// Only a same-site path is honoured, so ?redirectTo cannot bounce the user off the host.
		const target = parsed.data.redirectTo;
		redirect(303, target?.startsWith('/') ? target : home);
	}
} satisfies Actions;
