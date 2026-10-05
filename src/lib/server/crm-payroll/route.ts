import { error } from '@sveltejs/kit';
import { requireAction, requireScope } from '../auth/guard';
import { PolicyService } from '../auth/policy';
import type { ActorContext } from '$lib/types/actor';
import { payrollDateSchema } from '$lib/validation/crm-payroll';

/**
 * Layout guards do not run for actions and endpoints, so every entry point of the payroll checks
 * the contour and `payroll.read` itself; the services check `payroll.manage` on each write.
 */
export function payrollActor(event: {
	readonly locals: App.Locals;
	readonly url: URL;
}): ActorContext {
	return requireAction(requireScope(event.locals.actor, 'crm', event.url.pathname), 'payroll.read');
}

/** For the page only: which buttons to draw. The services decide on every write again. */
export function canManagePayroll(actor: ActorContext): boolean {
	return PolicyService.can(actor, 'payroll.manage');
}

/** A date in the address that is not a date is a missing page, not a broken form. */
export function routeDate(value: string | null | undefined): string {
	const parsed = payrollDateSchema.safeParse(value);
	if (!parsed.success) error(404, { code: 'not_found', message: 'Такого дня нет' });
	return parsed.data;
}
