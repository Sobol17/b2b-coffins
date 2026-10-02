import { rethrowAsHttp } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { stockActor, xlsxResponse } from '$lib/server/crm-stock/route';
import { StockExportService } from '$lib/server/crm-stock/stock-export.service';
import { stockFiltersSchema } from '$lib/validation/crm-stock';
import type { RequestHandler } from './$types';

// The same query string as the registry page: the sheet is what the administrator is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = stockActor(event);
	const filters = stockFiltersSchema.parse(Object.fromEntries(event.url.searchParams));
	let body: Buffer;
	try {
		body = await new StockExportService(actor).registry(parseListQuery(event.url, filters));
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'stock', 'Склад');
};
