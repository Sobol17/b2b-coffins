import { requireAction, requireScope } from '../auth/guard';
import { ValidationError } from '../core/errors';
import type { ReportRange } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import { financeFiltersSchema, type FinanceFiltersInput } from '$lib/validation/finance';

/**
 * Layout guards do not run for actions and endpoints, so every entry point of the finance page
 * checks the contour and `finance.manage` itself, before it reads a form or a query.
 */
export function financeActor(event: {
	readonly locals: App.Locals;
	readonly url: URL;
}): ActorContext {
	return requireAction(
		requireScope(event.locals.actor, 'crm', event.url.pathname),
		'finance.manage'
	);
}

/**
 * The filters of the sheet. A page opened from the menu has no dates in its address, the server
 * shows the current month there, so the sheet takes the same month instead of refusing.
 * @throws ValidationError for a period the page would refuse too.
 */
export function sheetFilters(url: URL, fallback: ReportRange): FinanceFiltersInput {
	const parsed = financeFiltersSchema.safeParse({
		...fallback,
		...Object.fromEntries(url.searchParams)
	});
	if (!parsed.success) {
		throw new ValidationError(parsed.error.issues[0]?.message ?? 'Выберите даты периода');
	}
	return parsed.data;
}
