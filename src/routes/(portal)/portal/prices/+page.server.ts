import { fail } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { AppError, httpStatusFor, userMessage } from '$lib/server/core/errors';
import { parseListQuery } from '$lib/server/core/list';
import { CatalogService } from '$lib/server/catalog/catalog.service';
import { AgencyPriceService } from '$lib/server/pricing/agency-price.service';
import {
	agencyPriceEntriesFrom,
	agencyPriceFiltersSchema,
	agencyPricePageSchema
} from '$lib/validation/agency-price';
import type { Actions, PageServerLoad } from './$types';

// Layout guards do not run for actions, so every entry point checks the contour and the right.
function priceService(locals: App.Locals, url: URL): AgencyPriceService {
	const actor = requireScope(locals.actor, 'portal', url.pathname);
	return new AgencyPriceService(requireAction(actor, 'prices.manage'));
}

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireScope(locals.actor, 'portal', url.pathname);
	requireAction(actor, 'prices.manage');
	const filters = agencyPriceFiltersSchema.parse(Object.fromEntries(url.searchParams));
	return {
		prices: new AgencyPriceService(actor).list(parseListQuery(url, filters)),
		categories: new CatalogService(actor).categories()
	};
};

export const actions = {
	save: async ({ request, locals, url }) => {
		const service = priceService(locals, url);
		const entries = agencyPriceEntriesFrom(await request.formData());
		const parsed = agencyPricePageSchema.safeParse({ entries });
		if (!parsed.success) return fail(422, { formError: 'Проверьте цены на странице' });
		try {
			return { saved: service.save(parsed.data.entries) };
		} catch (err) {
			if (!(err instanceof AppError)) throw err;
			return fail(httpStatusFor(err), { formError: userMessage(err) });
		}
	}
} satisfies Actions;
