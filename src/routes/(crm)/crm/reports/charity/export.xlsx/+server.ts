import { rethrowAsHttp } from '$lib/server/core/http';
import { normalizeListQuery } from '$lib/server/core/list';
import { CharityReportService } from '$lib/server/crm-reports/charity-report.service';
import { ReportExportService } from '$lib/server/crm-reports/report-export.service';
import { parseOr422, reportsActor } from '$lib/server/crm-reports/route';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { OrgService } from '$lib/server/settings/org.service';
import { reportRangeSchema } from '$lib/validation/crm-reports';
import type { RequestHandler } from './$types';

const CHARITY_EXPORT_LIMIT = 10_000;

// The same query string as the page: the sheet is what the owner is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = reportsActor(event);
	const sheets = new ReportExportService(OrgService.timezone());
	let body: Buffer;
	try {
		const range = parseOr422(reportRangeSchema, event.url);
		// The registry whole: the clamp of a screen page is not for a sheet.
		const query = { ...normalizeListQuery({}), perPage: CHARITY_EXPORT_LIMIT };
		body = await sheets.charity(new CharityReportService(actor).report(range, query));
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'charity', 'Фонд');
};
