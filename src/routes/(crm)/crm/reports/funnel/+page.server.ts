import { FunnelReportService } from '$lib/server/crm-reports/funnel-report.service';
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import { reportRangeSchema } from '$lib/validation/crm-reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new FunnelReportService(reportsActor(event));
	return {
		today: service.today(),
		...loadReport(event.url, reportRangeSchema, service.defaultRange(), (input) =>
			service.report(input)
		)
	};
};
