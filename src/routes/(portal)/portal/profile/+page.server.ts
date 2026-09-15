import { fail } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { ProfileService } from '$lib/server/profile/profile.service';
import { updateProfileSchema } from '$lib/validation/profile';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireScope(locals.actor, 'portal', url.pathname);
	return { profile: new ProfileService(requireAction(actor, 'portal.access')).get() };
};

export const actions = {
	// Layout guards do not run for actions, so the action checks the contour itself.
	default: async ({ request, locals, url }) => {
		const actor = requireAction(
			requireScope(locals.actor, 'portal', url.pathname),
			'portal.access'
		);

		const parsed = updateProfileSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(422, { errors: parsed.error.flatten().fieldErrors });

		return { saved: true, profile: new ProfileService(actor).update(parsed.data) };
	}
} satisfies Actions;
