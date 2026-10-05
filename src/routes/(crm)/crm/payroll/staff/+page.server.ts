import { formAction } from '$lib/server/core/http';
import { PayrollStaffService } from '$lib/server/crm-payroll/payroll-staff.service';
import { canManagePayroll, payrollActor } from '$lib/server/crm-payroll/route';
import { payrollIdSchema, staffCreateSchema, staffUpdateSchema } from '$lib/validation/crm-payroll';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const actor = payrollActor(event);
	return { staff: new PayrollStaffService(actor).list(), canManage: canManagePayroll(actor) };
};

export const actions = {
	create: (event) => {
		const service = new PayrollStaffService(payrollActor(event));
		return formAction(event.request, 'create', staffCreateSchema, (input) => {
			service.create(input);
		});
	},
	update: (event) => {
		const service = new PayrollStaffService(payrollActor(event));
		return formAction(event.request, 'update', staffUpdateSchema, (input) => {
			service.update(input);
		});
	},
	disable: (event) => {
		const service = new PayrollStaffService(payrollActor(event));
		return formAction(event.request, 'disable', payrollIdSchema, (input) => {
			service.setActive(input.id, false);
		});
	},
	enable: (event) => {
		const service = new PayrollStaffService(payrollActor(event));
		return formAction(event.request, 'enable', payrollIdSchema, (input) => {
			service.setActive(input.id, true);
		});
	}
} satisfies Actions;
