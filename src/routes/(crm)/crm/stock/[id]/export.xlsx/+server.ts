import { rethrowAsHttp } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { routeId, stockActor, xlsxResponse } from '$lib/server/crm-stock/route';
import { StockExportService } from '$lib/server/crm-stock/stock-export.service';
import { stockJournalFiltersSchema } from '$lib/validation/crm-stock';
import type { RequestHandler } from './$types';

// The journal of one item with the filter of the card: every move its balance is made of.
export const GET: RequestHandler = async (event) => {
	const actor = stockActor(event);
	const id = routeId(event.params.id, 'Позиция не найдена');
	const filters = stockJournalFiltersSchema.parse(Object.fromEntries(event.url.searchParams));
	let body: Buffer;
	try {
		body = await new StockExportService(actor).journal(id, parseListQuery(event.url, filters));
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'stock-moves', 'Движения по позиции');
};
