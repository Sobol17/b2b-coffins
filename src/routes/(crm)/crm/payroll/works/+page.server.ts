import { parseListQuery } from '$lib/server/core/list';
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
	const service = new WorkTypeService(actor);
	const canManage = canManagePayroll(actor);
	return {
		matrix: service.matrix(parseListQuery(event.url)),
		variants: canManage ? service.variantChoices() : [],
		canManage
	};
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
