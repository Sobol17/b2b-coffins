import { fail, redirect } from '@sveltejs/kit';
import { AuthService } from '$lib/server/auth/auth.service';
import { AppError } from '$lib/server/core/errors';
import { mailDriver } from '$lib/server/notifications/drivers/mail/select';
import { applyResetSchema, requestResetSchema } from '$lib/validation/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions = {
	request: async ({ request, getClientAddress }) => {
		const parsed = requestResetSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { errors: parsed.error.flatten().fieldErrors });

		try {
			await new AuthService(undefined, mailDriver()).requestReset(
				parsed.data.email,
				getClientAddress()
			);
		} catch (err) {
			if (!(err instanceof AppError)) throw err;
			return fail(429, { formError: err.message });
		}

		// The same answer whether or not the address exists.
		return { sent: true };
	},

	apply: async ({ request }) => {
		const parsed = applyResetSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { errors: parsed.error.flatten().fieldErrors });

		try {
			await new AuthService().applyReset(parsed.data);
		} catch (err) {
			if (!(err instanceof AppError)) throw err;
			return fail(422, { formError: err.message });
		}

		redirect(303, '/login?reset=1');
	}
} satisfies Actions;
