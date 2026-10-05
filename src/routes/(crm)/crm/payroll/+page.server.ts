import { z } from 'zod';
import { formAction, orHttpStatus } from '$lib/server/core/http';
import { PayrollCloseService } from '$lib/server/crm-payroll/payroll-close.service';
import { PayrollWeekService } from '$lib/server/crm-payroll/payroll-week.service';
import { payrollActor, routeDate } from '$lib/server/crm-payroll/route';
import {
	payrollAdjustSchema,
	payrollCloseSchema,
	payrollPaySchema,
	payrollReopenSchema,
	payrollUnpaySchema
} from '$lib/validation/crm-payroll';
import type { Actions, PageServerLoad } from './$types';

const weekQuerySchema = z.object({ week: z.string().optional() });

export const load: PageServerLoad = (event) => {
	const service = new PayrollWeekService(payrollActor(event));
	const { week } = weekQuerySchema.parse(Object.fromEntries(event.url.searchParams));
	const today = service.today();
	return {
		today,
		week: orHttpStatus(() => service.week(week === undefined ? today : routeDate(week)))
	};
};

export const actions = {
	adjust: (event) => {
		const service = new PayrollWeekService(payrollActor(event));
		return formAction(event.request, 'adjust', payrollAdjustSchema, (input) => {
			service.adjust(input);
		});
	},
	close: (event) => {
		const actor = payrollActor(event);
		return formAction(event.request, 'close', payrollCloseSchema, (input) =>
			new PayrollCloseService(actor).close(input.week)
		);
	},
	reopen: (event) => {
		const actor = payrollActor(event);
		return formAction(event.request, 'reopen', payrollReopenSchema, (input) =>
			new PayrollCloseService(actor).reopen(input)
		);
	},
	pay: (event) => {
		const actor = payrollActor(event);
		return formAction(event.request, 'pay', payrollPaySchema, (input) =>
			new PayrollCloseService(actor).pay(input)
		);
	},
	unpay: (event) => {
		const actor = payrollActor(event);
		return formAction(event.request, 'unpay', payrollUnpaySchema, (input) =>
			new PayrollCloseService(actor).unpay(input.lineId)
		);
	}
} satisfies Actions;
