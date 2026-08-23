import { error, redirect } from '@sveltejs/kit';
import type { ActorContext } from '$lib/types/actor';
import type { Scope } from '$lib/types/roles';
import { PolicyService, type Action } from './policy';

/** Anonymous visitors go to the login form; a signed-in user in the wrong contour gets 403. */
export function requireScope(
	actor: ActorContext | null,
	scope: Scope,
	pathname: string
): ActorContext {
	if (!actor) redirect(303, `/login?redirectTo=${encodeURIComponent(pathname)}`);
	if (actor.scope !== scope) error(403, { code: 'forbidden', message: 'Доступ запрещён' });
	return actor;
}

export function requireAction(actor: ActorContext | null, action: Action): ActorContext {
	if (!actor) error(403, { code: 'forbidden', message: 'Доступ запрещён' });
	if (!PolicyService.can(actor, action)) {
		error(403, { code: 'forbidden', message: 'Доступ запрещён' });
	}
	return actor;
}
