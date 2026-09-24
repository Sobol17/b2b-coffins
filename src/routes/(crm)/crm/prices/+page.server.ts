import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CrmCatalogService } from '$lib/server/crm-catalog/crm-catalog.service';
import { CrmPricingService } from '$lib/server/crm-pricing/crm-pricing.service';
import { actionFailure, invalidForm } from '$lib/server/core/http';
import {
	discountRuleInputSchema,
	entityIdSchema,
	priceListInputSchema
} from '$lib/validation/crm-catalog';
import type { Actions, PageServerLoad } from './$types';

function services(locals: App.Locals, url: URL) {
	const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'catalog.manage');
	return { pricing: new CrmPricingService(actor), catalog: new CrmCatalogService(actor) };
}

export const load: PageServerLoad = ({ locals, url }) => {
	const { pricing, catalog } = services(locals, url);
	return {
		lists: pricing.listPriceLists(),
		rules: pricing.listDiscountRules(),
		categories: catalog.listCategories(),
		choices: pricing.choices()
	};
};

export const actions = {
	createList: async ({ request, locals, url }) => {
		const { pricing } = services(locals, url);
		const parsed = priceListInputSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { list: pricing.createPriceList(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	updateList: async ({ request, locals, url }) => {
		const { pricing } = services(locals, url);
		const form = Object.fromEntries(await request.formData());
		const id = entityIdSchema.safeParse(form);
		const parsed = priceListInputSchema.safeParse(form);
		if (!id.success) return invalidForm(id.error);
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { list: pricing.updatePriceList(id.data.id, parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	deleteList: async ({ request, locals, url }) => {
		const { pricing } = services(locals, url);
		const parsed = entityIdSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			pricing.deletePriceList(parsed.data.id);
			return { id: parsed.data.id };
		} catch (err) {
			return actionFailure(err);
		}
	},
	createRule: async ({ request, locals, url }) => {
		const { pricing } = services(locals, url);
		const parsed = discountRuleInputSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { rule: pricing.createDiscountRule(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	updateRule: async ({ request, locals, url }) => {
		const { pricing } = services(locals, url);
		const form = Object.fromEntries(await request.formData());
		const id = entityIdSchema.safeParse(form);
		const parsed = discountRuleInputSchema.safeParse(form);
		if (!id.success) return invalidForm(id.error);
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { rule: pricing.updateDiscountRule(id.data.id, parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	deleteRule: async ({ request, locals, url }) => {
		const { pricing } = services(locals, url);
		const parsed = entityIdSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			pricing.deleteDiscountRule(parsed.data.id);
			return { id: parsed.data.id };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
