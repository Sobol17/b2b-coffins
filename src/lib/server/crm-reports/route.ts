import type { ZodType } from 'zod';
import { requireAction, requireScope } from '../auth/guard';
import { AppError, ValidationError, userMessage } from '../core/errors';
import type { ReportRange } from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';

const NO_RANGE = 'Выберите даты периода';

/**
 * Layout guards do not run for actions and endpoints, so every entry point of the reports checks
 * the contour and `reports.read` itself; the transfer service checks `charity.manage` again.
 */
export function reportsActor(event: {
	readonly locals: App.Locals;
	readonly url: URL;
}): ActorContext {
	return requireAction(requireScope(event.locals.actor, 'crm', event.url.pathname), 'reports.read');
}

/** A range the report refuses still opens the page: the filter stays to be corrected. */
export function loadReport<I extends ReportRange, R>(
	url: URL,
	schema: ZodType<I>,
	fallback: ReportRange,
	run: (input: I) => R
): { filters: Record<string, string>; report: R | null; problem: string | null } {
	const filters: Record<string, string> = { ...fallback, ...Object.fromEntries(url.searchParams) };
	const parsed = schema.safeParse(filters);
	if (!parsed.success) {
		return { filters, report: null, problem: parsed.error.issues[0]?.message ?? NO_RANGE };
	}
	try {
		return { filters, report: run(parsed.data), problem: null };
	} catch (err) {
		if (!(err instanceof AppError)) throw err;
		return { filters, report: null, problem: userMessage(err) };
	}
}

/** For sheets: there is no filter to correct, so a broken query is a 422. */
export function parseOr422<I>(schema: ZodType<I>, url: URL): I {
	const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? NO_RANGE);
	return parsed.data;
}
