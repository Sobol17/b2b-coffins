import { fail, redirect } from '@sveltejs/kit';
import { AuthService } from '$lib/server/auth/auth.service';
import { clearSessionCookie } from '$lib/server/auth/cookies';
import { AppError, userMessage } from '$lib/server/core/errors';
import { changePasswordSchema } from '$lib/validation/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.actor) redirect(303, '/login');
	return { mustChange: locals.user?.mustChangePassword ?? false };
};

export const actions = {
	default: async ({ request, locals, cookies }) => {
		if (!locals.actor) redirect(303, '/login');

		const parsed = changePasswordSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { errors: parsed.error.flatten().fieldErrors });

		try {
			await new AuthService().changePassword(locals.actor.userId, parsed.data);
		} catch (err) {
			if (!(err instanceof AppError)) throw err;
			return fail(422, { formError: userMessage(err) });
		}

		// The change killed every session, this one included: send the user back to the form.
		clearSessionCookie(cookies);
		redirect(303, '/login?changed=1');
	}
} satisfies Actions;
