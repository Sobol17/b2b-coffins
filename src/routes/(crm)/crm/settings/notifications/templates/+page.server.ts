import { requireAction, requireScope } from '$lib/server/auth/guard';
import { formAction } from '$lib/server/core/http';
import { PushTemplateService } from '$lib/server/notifications/push-template.service';
import { pushTemplateSchema } from '$lib/validation/push';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function service(locals: App.Locals, url: URL): PushTemplateService {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	return new PushTemplateService(requireAction(actor, 'settings.manage'));
}

export const load: PageServerLoad = ({ locals, url }) => ({
	templates: service(locals, url).list()
});

export const actions = {
	// The right is checked before the form is read: a stranger learns nothing from its validation.
	save: ({ request, locals, url }) => {
		const templates = service(locals, url);
		return formAction(request, 'save', pushTemplateSchema, (input) => templates.save(input));
	},
	test: ({ request, locals, url }) => {
		const templates = service(locals, url);
		return formAction(request, 'test', pushTemplateSchema, (input) => templates.sendTest(input));
	}
} satisfies Actions;
