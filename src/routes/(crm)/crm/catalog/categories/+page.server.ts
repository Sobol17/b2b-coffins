import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CrmCatalogService } from '$lib/server/crm-catalog/crm-catalog.service';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import { categoryInputSchema, entityIdSchema } from '$lib/validation/crm-catalog';
import type { Actions, PageServerLoad } from './$types';

function service(locals: App.Locals, url: URL): CrmCatalogService {
	return new CrmCatalogService(
		requireAction(requireScope(locals.actor, 'crm', url.pathname), 'catalog.manage')
	);
}

export const load: PageServerLoad = ({ locals, url }) => ({
	categories: service(locals, url).listCategories()
});

export const actions = {
	create: async ({ request, locals, url }) => {
		const catalog = service(locals, url);
		const parsed = categoryInputSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { category: catalog.createCategory(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	update: async ({ request, locals, url }) => {
		const catalog = service(locals, url);
		const form = Object.fromEntries(await request.formData());
		const id = entityIdSchema.safeParse(form);
		const parsed = categoryInputSchema.safeParse(form);
		if (!id.success) return invalidForm(id.error);
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { category: catalog.updateCategory(id.data.id, parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	delete: async ({ request, locals, url }) => {
		const catalog = service(locals, url);
		const id = entityIdSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!id.success) return invalidForm(id.error);
		try {
			catalog.deleteCategory(id.data.id);
			return { id: id.data.id };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
