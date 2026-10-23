import { requireAction, requireScope } from '../auth/guard';
import type { ActorContext } from '$lib/types/actor';

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
