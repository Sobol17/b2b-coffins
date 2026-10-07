import { DashboardService } from '$lib/server/crm-reports/dashboard.service';
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import { reportRangeSchema } from '$lib/validation/crm-reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new DashboardService(reportsActor(event));
	return {
		today: service.today(),
		...loadReport(event.url, reportRangeSchema, service.defaultRange(), (input) =>
			service.dashboard(input)
		)
	};
};
