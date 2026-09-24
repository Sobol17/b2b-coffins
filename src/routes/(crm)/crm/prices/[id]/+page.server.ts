import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { CrmCatalogService } from '$lib/server/crm-catalog/crm-catalog.service';
import { CrmPricingService } from '$lib/server/crm-pricing/crm-pricing.service';
import { actionFailure, invalidForm, orHttpStatus } from '$lib/server/core/http';
import { entityIdSchema, priceListItemInputSchema } from '$lib/validation/crm-catalog';
import { productIdSchema } from '$lib/validation/catalog';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function services(event: RequestEvent) {
	const parsed = productIdSchema.safeParse(event.params.id);
	if (!parsed.success) error(404, { code: 'not_found', message: 'Прайс-лист не найден' });
	const actor = requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'catalog.manage'
	);
	return {
		id: parsed.data,
		pricing: new CrmPricingService(actor),
		catalog: new CrmCatalogService(actor)
	};
}

export const load: PageServerLoad = (event) => {
	const { id, pricing, catalog } = services(event);
	return orHttpStatus(() => ({
		list: pricing.getPriceList(id),
		variants: catalog.choices().variants
	}));
};

export const actions = {
	upsert: async (event) => {
		const { id, pricing } = services(event);
		const parsed = priceListItemInputSchema.safeParse({
			...Object.fromEntries(await event.request.formData()),
			priceListId: id
		});
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { list: pricing.upsertPriceItem(parsed.data) };
		} catch (err) {
			return actionFailure(err);
		}
	},
	delete: async (event) => {
		const { id, pricing } = services(event);
		const parsed = entityIdSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!parsed.success) return invalidForm(parsed.error);
		try {
			return { list: pricing.deletePriceItem(id, parsed.data.id) };
		} catch (err) {
			return actionFailure(err);
		}
	}
} satisfies Actions;
