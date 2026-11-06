import { requireAction, requireScope } from '$lib/server/auth/guard';
import { orHttpStatus } from '$lib/server/core/http';
import { OwnPayrollService } from '$lib/server/crm-payroll/own-payroll.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'payroll.self.read');
	const service = new OwnPayrollService(actor);
	return {
		salary: orHttpStatus(() => service.week(url.searchParams.get('week') ?? service.today()))
	};
};
