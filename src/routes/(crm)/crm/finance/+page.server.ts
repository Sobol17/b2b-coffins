import { formAction } from '$lib/server/core/http';
import { parseListQuery } from '$lib/server/core/list';
import { loadReport } from '$lib/server/crm-reports/route';
import { FinanceEntryService } from '$lib/server/finance/finance-entry.service';
import { FinanceService } from '$lib/server/finance/finance.service';
import { financeActor } from '$lib/server/finance/route';
import {
	financeDeleteSchema,
	financeEntrySchema,
	financeEntryUpdateSchema,
	financeFiltersSchema
} from '$lib/validation/finance';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const service = new FinanceService(financeActor(event));
	return {
		today: service.today(),
		...loadReport(event.url, financeFiltersSchema, service.defaultRange(), (input) =>
			service.page(input, parseListQuery(event.url))
		)
	};
};

export const actions = {
	create: (event) => {
		const actor = financeActor(event);
		return formAction(event.request, 'create', financeEntrySchema, (input) =>
			new FinanceEntryService(actor).create(input)
		);
	},
	update: (event) => {
		const actor = financeActor(event);
		return formAction(event.request, 'update', financeEntryUpdateSchema, (input) => {
			new FinanceEntryService(actor).update(input);
		});
	},
	remove: (event) => {
		const actor = financeActor(event);
		return formAction(event.request, 'remove', financeDeleteSchema, (input) => {
			new FinanceEntryService(actor).remove(input);
		});
	}
} satisfies Actions;
