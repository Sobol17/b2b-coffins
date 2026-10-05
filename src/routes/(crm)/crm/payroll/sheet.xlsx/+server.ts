import { rethrowAsHttp } from '$lib/server/core/http';
import { PayrollExportService } from '$lib/server/crm-payroll/payroll-export.service';
import { payrollActor, routeDate } from '$lib/server/crm-payroll/route';
import { xlsxResponse } from '$lib/server/crm-stock/route';
import type { RequestHandler } from './$types';

// The week of the screen: the sheet is what the administrator is looking at.
export const GET: RequestHandler = async (event) => {
	const actor = payrollActor(event);
	const date = routeDate(event.url.searchParams.get('week'));
	try {
		const { week, body } = await new PayrollExportService(actor).sheet(date);
		return xlsxResponse(body, `payroll-${week.startsOn}`, `Ведомость ${week.startsOn}`);
	} catch (err) {
		rethrowAsHttp(err);
	}
};
