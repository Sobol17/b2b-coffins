import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { rethrowAsHttp } from '$lib/server/core/http';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { CrmPriceExportService } from '$lib/server/crm-pricing/price-export.service';
import { entityIdSchema } from '$lib/validation/crm-catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const actor = requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'catalog.manage'
	);
	const parsed = entityIdSchema.safeParse(event.params);
	if (!parsed.success) error(404, { code: 'not_found', message: 'Прайс не найден' });
	try {
		return xlsxResponse(
			await new CrmPriceExportService(actor).list(parsed.data.id),
			'price-list',
			'Прайс'
		);
	} catch (err) {
		rethrowAsHttp(err);
	}
};
