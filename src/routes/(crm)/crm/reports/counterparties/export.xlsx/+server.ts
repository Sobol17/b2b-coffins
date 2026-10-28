import { rethrowAsHttp } from '$lib/server/core/http';
import { CounterpartyReportService } from '$lib/server/crm-reports/counterparty-report.service';
import { marginWorkbook } from '$lib/server/crm-reports/margin-export';
import { parseOr422, reportsActor } from '$lib/server/crm-reports/route';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { OrgService } from '$lib/server/settings/org.service';
import { counterpartyReportSchema } from '$lib/validation/crm-reports';
import type { RequestHandler } from './$types';

// The same query string as the page: the sheet is what the owner is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = reportsActor(event);
	let body: Buffer;
	try {
		const dto = new CounterpartyReportService(actor).report(
			parseOr422(counterpartyReportSchema, event.url)
		);
		body = await marginWorkbook(dto, OrgService.timezone());
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'counterparties', 'По контрагентам');
};
