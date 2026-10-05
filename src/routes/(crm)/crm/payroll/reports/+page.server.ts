import { AppError, userMessage } from '$lib/server/core/errors';
import { PayrollReportService } from '$lib/server/crm-payroll/payroll-report.service';
import { payrollActor } from '$lib/server/crm-payroll/route';
import { payrollReportSchema } from '$lib/validation/crm-payroll';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new PayrollReportService(payrollActor(event));
	const fallback = service.defaultRange();
	const asked = Object.fromEntries(event.url.searchParams);
	const parsed = payrollReportSchema.safeParse({ ...fallback, ...asked });
	// A range the report refuses still opens the page: the filter stays to be corrected.
	if (!parsed.success) {
		return { range: fallback, report: null, problem: 'Выберите даты периода' };
	}
	try {
		return { range: parsed.data, report: service.report(parsed.data), problem: null };
	} catch (err) {
		if (!(err instanceof AppError)) throw err;
		return { range: parsed.data, report: null, problem: userMessage(err) };
	}
};
