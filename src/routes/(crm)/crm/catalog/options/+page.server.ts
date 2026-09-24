import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CrmCatalogService } from '$lib/server/crm-catalog/crm-catalog.service';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import {
	entityIdSchema,
	optionActiveInputSchema,
	optionInputSchema
} from '$lib/validation/crm-catalog';
import type { Actions, PageServerLoad } from './$types';

function service(locals: App.Locals, url: URL): CrmCatalogService {
	return new CrmCatalogService(
		requireAction(requireScope(locals.actor, 'crm', url.pathname), 'catalog.manage')
	);
}

export const load: PageServerLoad = ({ locals, url }) => {
	const catalog = service(locals, url);
	return { options: catalog.listOptions(), choices: catalog.choices() };
};

export const actions = {
	create: async ({ request, locals, url }) => {
		const catalog = service(locals, url);
		const parsed = optionInputSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { option: catalog.createOption(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	update: async ({ request, locals, url }) => {
		const catalog = service(locals, url);
		const form = Object.fromEntries(await request.formData());
		const id = entityIdSchema.safeParse(form);
		const parsed = optionInputSchema.safeParse(form);
		if (!id.success) return invalidForm(id.error);
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { option: catalog.updateOption(id.data.id, parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	active: async ({ request, locals, url }) => {
		const catalog = service(locals, url);
		const parsed = optionActiveInputSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { option: catalog.setOptionActive(parsed.data.id, parsed.data.isActive) };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
