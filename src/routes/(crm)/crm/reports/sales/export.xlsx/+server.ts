import { rethrowAsHttp } from '$lib/server/core/http';
import { ReportExportService } from '$lib/server/crm-reports/report-export.service';
import { parseOr422, reportsActor } from '$lib/server/crm-reports/route';
import { SalesReportService } from '$lib/server/crm-reports/sales-report.service';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import { OrgService } from '$lib/server/settings/org.service';
import { salesReportSchema } from '$lib/validation/crm-reports';
import type { RequestHandler } from './$types';

// The same query string as the page: the sheet is what the owner is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = reportsActor(event);
	const sheets = new ReportExportService(OrgService.timezone());
	let body: Buffer;
	try {
		const dto = new SalesReportService(actor).report(parseOr422(salesReportSchema, event.url));
		body = await sheets.sales(dto);
	} catch (err) {
		rethrowAsHttp(err);
	}
	return xlsxResponse(body, 'sales', 'Продажи');
};
