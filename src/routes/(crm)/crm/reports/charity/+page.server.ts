import { formAction } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { CharityReportService } from '$lib/server/crm-reports/charity-report.service';
import { CharityTransferService } from '$lib/server/crm-reports/charity-transfer.service';
import { loadReport, reportsActor } from '$lib/server/crm-reports/route';
import {
	charityTransferReverseSchema,
	charityTransferSchema,
	reportRangeSchema
} from '$lib/validation/crm-reports';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new CharityReportService(reportsActor(event));
	return {
		today: service.today(),
		...loadReport(event.url, reportRangeSchema, service.defaultRange(), (range) =>
			service.report(range, parseListQuery(event.url))
		)
	};
};

export const actions = {
	transfer: (event) => {
		const actor = reportsActor(event);
		return formAction(event.request, 'transfer', charityTransferSchema, (input) =>
			new CharityTransferService(actor).transfer(input)
		);
	},
	reverse: (event) => {
		const actor = reportsActor(event);
		return formAction(event.request, 'reverse', charityTransferReverseSchema, (input) => {
			new CharityTransferService(actor).reverse(input);
		});
	}
} satisfies Actions;
