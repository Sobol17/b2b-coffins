import { requireAction, requireScope } from '$lib/server/auth/guard';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { NotificationSettingsService } from '$lib/server/notifications/notification-settings.service';
import { notificationPrefsSchema } from '$lib/validation/notifications';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function settingsService(locals: App.Locals, url: URL): NotificationSettingsService {
	const actor = requireScope(locals.actor, 'portal', url.pathname);
	return new NotificationSettingsService(requireAction(actor, 'portal.access'));
}

export const load: PageServerLoad = ({ locals, url }) => ({
	settings: settingsService(locals, url).settings(parseListQuery(url))
});

export const actions = {
	save: async ({ request, locals, url }) => {
		const service = settingsService(locals, url);
		const form = await request.formData();
		const parsed = notificationPrefsSchema.safeParse({ enabled: form.getAll('enabled') });
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { prefs: service.save(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
