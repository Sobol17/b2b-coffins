import { parseListQuery } from '$lib/server/core/list';
import { LostReportService } from '$lib/server/crm-reports/lost-report.service';
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import { lostReportSchema } from '$lib/validation/crm-reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new LostReportService(reportsActor(event));
	return {
		today: service.today(),
		...loadReport(event.url, lostReportSchema, service.defaultRange(), (input) =>
			service.report(input, parseListQuery(event.url))
		)
	};
};
