import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import { SalesReportService } from '$lib/server/crm-reports/sales-report.service';
import { salesReportSchema } from '$lib/validation/crm-reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new SalesReportService(reportsActor(event));
	return {
		today: service.today(),
		counterparties: service.counterparties(),
		...loadReport(event.url, salesReportSchema, service.defaultRange(), (input) =>
			service.report(input)
		)
	};
};
