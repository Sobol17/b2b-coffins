import { requireAction, requireScope } from '$lib/server/auth/guard';
import { rethrowAsHttp } from '$lib/server/core/http';
import {
	PRICE_LIST_MIME,
	PriceListExportService
} from '$lib/server/catalog/price-list-export.service';
import type { RequestHandler } from './$types';

// A role without prices gets 403 from the service: the button is hidden for it, but that is no guard.
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'catalog.read');
	let body: Buffer;
	try {
		body = await new PriceListExportService(actor).workbook();
	} catch (err) {
		rethrowAsHttp(err);
	}

	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': PRICE_LIST_MIME,
			'content-disposition': `attachment; filename="price-list.xlsx"; filename*=UTF-8''${encodeURIComponent('Прайс-лист.xlsx')}`,
			'cache-control': 'private, no-store'
		}
	});
};
