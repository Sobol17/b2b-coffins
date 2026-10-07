import { rethrowAsHttp } from '$lib/server/core/http';
import { normalizeListQuery } from '$lib/server/core/list';
import { LostReportService } from '$lib/server/crm-reports/lost-report.service';
import { ReportExportService } from '$lib/server/crm-reports/report-export.service';
import { parseOr422, reportsActor } from '$lib/server/crm-reports/route';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { OrgService } from '$lib/server/settings/org.service';
import { lostReportSchema } from '$lib/validation/crm-reports';
import type { RequestHandler } from './$types';

// The same query string as the page: the sheet is what the owner is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = reportsActor(event);
	const sheets = new ReportExportService(OrgService.timezone());
	let body: Buffer;
	try {
		const service = new LostReportService(actor);
		const input = parseOr422(lostReportSchema, event.url);
		// The page of the screen is 25 rows; the sheet takes the whole period.
		const dto = service.report(input, normalizeListQuery({}));
		body = await sheets.lost(dto, service.exportRows(input));
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'lost-requests', 'Потерянные заявки');
};
