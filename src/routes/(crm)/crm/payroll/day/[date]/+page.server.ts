import { formAction, orHttpStatus } from '$lib/server/core/http';
import { payrollActor, routeDate } from '$lib/server/crm-payroll/route';
import { WorkDayService } from '$lib/server/crm-payroll/work-day.service';
import { workDayDateSchema, workDayFormSchema } from '$lib/validation/crm-payroll';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const date = routeDate(event.params.date);
	const service = new WorkDayService(payrollActor(event));
	return { day: orHttpStatus(() => service.get(date)) };
};

// The date comes from the address, never from the form: a day is saved where it is shown.
export const actions = {
	save: (event) => {
		const date = routeDate(event.params.date);
		const service = new WorkDayService(payrollActor(event));
		return formAction(
			event.request,
			'save',
			workDayFormSchema,
			(input) => {
				service.save(input);
			},
			{ date }
		);
	},
	copy: (event) => {
		const date = routeDate(event.params.date);
		const service = new WorkDayService(payrollActor(event));
		return formAction(
			event.request,
			'copy',
			workDayDateSchema,
			(input) => {
				service.copyPrevious(input.date);
			},
			{ date }
		);
	}
} satisfies Actions;
