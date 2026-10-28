import { fail } from '@sveltejs/kit';
import type { z } from 'zod';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CharityDocumentService } from '$lib/server/charity/charity-document.service';
import { formAction } from '$lib/server/core/http';
import { CrmSettingsService } from '$lib/server/settings/crm-settings.service';
import {
	charityDocumentUploadSchema,
	charityFormSchema,
	numberingFormSchema,
	requisitesFormSchema,
	staffLimitFormSchema,
	timezoneFormSchema
} from '$lib/validation/settings-form';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

type SettingsAction = 'requisites' | 'timezone' | 'numbering' | 'charity' | 'staffLimit';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function settingsService(locals: App.Locals, url: URL): CrmSettingsService {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	return new CrmSettingsService(requireAction(actor, 'settings.manage'));
}

/** One form of the page: parse with its schema, hand the data to the service, report back. */
function saving<S extends z.ZodType>(
	action: SettingsAction,
	schema: S,
	save: (service: CrmSettingsService, input: z.output<S>) => void
) {
	return async ({ request, locals, url }: RequestEvent) => {
		const service = settingsService(locals, url);
		const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) {
			const errors = (parsed.error as z.ZodError<Record<string, unknown>>).flatten().fieldErrors;
			return fail(422, { action, errors });
		}
		save(service, parsed.data);
		return { action, saved: true };
	};
}

function documentService(locals: App.Locals, url: URL): CharityDocumentService {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	return new CharityDocumentService(requireAction(actor, 'settings.manage'));
}

export const load: PageServerLoad = ({ locals, url }) => ({
	settings: settingsService(locals, url).read(),
	charityDocument: documentService(locals, url).current()
});

export const actions = {
	requisites: saving('requisites', requisitesFormSchema, (service, input) =>
		service.saveRequisites(input)
	),
	timezone: saving('timezone', timezoneFormSchema, (service, input) =>
		service.saveTimezone(input.timezone)
	),
	numbering: saving('numbering', numberingFormSchema, (service, input) =>
		service.saveNumbering(input)
	),
	charity: saving('charity', charityFormSchema, (service, input) => service.saveCharity(input)),
	charityDocument: ({ request, locals, url }) => {
		const service = documentService(locals, url);
		return formAction(request, 'charityDocument', charityDocumentUploadSchema, async (input) =>
			service.replace(Buffer.from(await input.file.arrayBuffer()))
		);
	},
	charityDocumentRemove: async ({ locals, url }) => {
		await documentService(locals, url).remove();
		return { action: 'charityDocumentRemove', saved: true };
	},
	staffLimit: saving('staffLimit', staffLimitFormSchema, (service, input) =>
		service.saveStaffLimitDefault(input.staffLimitDefault)
	)
} satisfies Actions;
