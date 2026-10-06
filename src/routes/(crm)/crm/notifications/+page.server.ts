import { requireAction, requireScope } from '$lib/server/auth/guard';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { NotificationFeedService } from '$lib/server/notifications/notification-feed.service';
import { NotificationSettingsService } from '$lib/server/notifications/notification-settings.service';
import type { ActorContext } from '$lib/types/actor';
import { notificationPrefsSchema } from '$lib/validation/notifications';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function crmActor(locals: App.Locals, url: URL): ActorContext {
	return requireAction(requireScope(locals.actor, 'crm', url.pathname), 'crm.access');
}

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = crmActor(locals, url);
	return {
		prefs: new NotificationSettingsService(actor).settings().prefs,
		feed: new NotificationFeedService(actor).list(parseListQuery<never>(url))
	};
};

export const actions = {
	save: async ({ request, locals, url }) => {
		const service = new NotificationSettingsService(crmActor(locals, url));
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
