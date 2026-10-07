import { StockTurnoverService } from '$lib/server/crm-reports/stock-turnover.service';
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import { stockTurnoverSchema } from '$lib/validation/crm-reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new StockTurnoverService(reportsActor(event));
	return {
		today: service.today(),
		...loadReport(event.url, stockTurnoverSchema, service.defaultRange(), (input) =>
			service.report(input)
		)
	};
};
