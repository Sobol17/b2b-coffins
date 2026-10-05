import { formAction } from '$lib/server/core/http';
import { canManagePayroll, payrollActor } from '$lib/server/crm-payroll/route';
import { WorkTypeService } from '$lib/server/crm-payroll/work-type.service';
import {
	payrollIdSchema,
	workTypeCreateSchema,
	workTypeUpdateSchema
} from '$lib/validation/crm-payroll';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const actor = payrollActor(event);
	return { works: new WorkTypeService(actor).list(), canManage: canManagePayroll(actor) };
};

export const actions = {
	create: (event) => {
		const service = new WorkTypeService(payrollActor(event));
		return formAction(event.request, 'create', workTypeCreateSchema, (input) => {
			service.create(input);
		});
	},
	update: (event) => {
		const service = new WorkTypeService(payrollActor(event));
		return formAction(event.request, 'update', workTypeUpdateSchema, (input) => {
			service.update(input);
		});
	},
	disable: (event) => {
		const service = new WorkTypeService(payrollActor(event));
		return formAction(event.request, 'disable', payrollIdSchema, (input) => {
			service.setActive(input.id, false);
		});
	},
	enable: (event) => {
		const service = new WorkTypeService(payrollActor(event));
		return formAction(event.request, 'enable', payrollIdSchema, (input) => {
			service.setActive(input.id, true);
		});
	}
} satisfies Actions;
