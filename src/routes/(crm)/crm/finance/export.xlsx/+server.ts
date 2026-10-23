import { rethrowAsHttp } from '$lib/server/core/http';
import { parseOr422 } from '$lib/server/crm-reports/route';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { FinanceExportService } from '$lib/server/finance/finance-export.service';
import { FinanceService } from '$lib/server/finance/finance.service';
import { financeActor } from '$lib/server/finance/route';
import { financeFiltersSchema } from '$lib/validation/finance';
import type { RequestHandler } from './$types';

// The same query string as the page: the sheet is what the owner is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = financeActor(event);
	let body: Buffer;
	try {
		const filters = parseOr422(financeFiltersSchema, event.url);
		body = await new FinanceExportService().sheet(new FinanceService(actor).feedAll(filters));
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'finance', 'Финансы');
};
