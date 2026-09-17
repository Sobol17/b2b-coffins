import { error, fail } from '@sveltejs/kit';
import { AppError, NotFoundError, httpStatusFor, publicErrorBody, userMessage } from './errors';

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

/**
 * For page loads that read one object: a domain refusal renders the error page of its own status,
 * because SvelteKit turns an unmapped error from a load into a 500 before the hooks see it.
 */
export function orHttpStatus<T>(run: () => T): T {
	try {
		return run();
	} catch (err) {
		rethrowAsHttp(err);
	}
}

/** For form actions: a domain refusal becomes a `fail` the page shows next to the form. */
export function actionFailure(err: unknown) {
	if (!(err instanceof AppError)) throw err;
	return fail(httpStatusFor(err), { formError: userMessage(err) });
}

/** For form actions: the first message of a rejected form, shown next to the form. */
export function invalidForm(problem: { readonly issues: readonly { readonly message: string }[] }) {
	return fail(422, { formError: problem.issues[0]?.message ?? 'Проверьте данные формы' });
}
