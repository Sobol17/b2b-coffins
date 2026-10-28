import { CounterpartyReportService } from '$lib/server/crm-reports/counterparty-report.service';
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import { counterpartyReportSchema } from '$lib/validation/crm-reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new CounterpartyReportService(reportsActor(event));
	return {
		today: service.today(),
		counterparties: service.counterparties(),
		...loadReport(event.url, counterpartyReportSchema, service.defaultRange(), (input) =>
			service.report(input)
		)
	};
};
