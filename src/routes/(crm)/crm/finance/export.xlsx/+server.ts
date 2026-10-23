import { rethrowAsHttp } from '$lib/server/core/http';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { FinanceExportService } from '$lib/server/finance/finance-export.service';
import { FinanceService } from '$lib/server/finance/finance.service';
import { financeActor, sheetFilters } from '$lib/server/finance/route';
import type { RequestHandler } from './$types';

// The same query string as the page: the sheet is what the owner is looking at.
export const GET: RequestHandler = async (event) => {
	const service = new FinanceService(financeActor(event));
	let body: Buffer;
	try {
		const filters = sheetFilters(event.url, service.defaultRange());
		body = await new FinanceExportService().sheet(service.feedAll(filters));
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'finance', 'Финансы');
};
