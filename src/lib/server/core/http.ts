import { error } from '@sveltejs/kit';
import { AppError, NotFoundError, httpStatusFor, publicErrorBody } from './errors';

/**
 * For page loads: a missing object renders the SvelteKit 404 page. Left alone, SvelteKit would turn
 * the NotFoundError into a 500 before the hooks handler ever sees it.
 */
export function orNotFound<T>(run: () => T, message: string): T {
	try {
		return run();
	} catch (err) {
		if (err instanceof NotFoundError) error(404, { code: 'not_found', message });
		throw err;
	}
}

/**
 * For `+server.ts` handlers: SvelteKit turns an error thrown from an endpoint into a 500 before the
 * hooks see it, so a domain error is mapped to its own status here.
 */
export function rethrowAsHttp(err: unknown): never {
	if (err instanceof AppError) error(httpStatusFor(err), publicErrorBody(err));
	throw err;
}
