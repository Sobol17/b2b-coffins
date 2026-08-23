import { json, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { SESSION_COOKIE, SessionService } from '$lib/server/auth/session.service';
import { AppError, httpStatusFor, publicErrorBody } from '$lib/server/core/errors';
import { logger } from '$lib/server/logger';
import { isProduction } from '$lib/server/config';

// Sits next to the CSP that SvelteKit emits from its own `csp` config.
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
	['X-Content-Type-Options', 'nosniff'],
	['Referrer-Policy', 'strict-origin-when-cross-origin'],
	['X-Frame-Options', 'DENY'],
	['Cross-Origin-Opener-Policy', 'same-origin'],
	['Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)']
];

/** Paths a signed-in user may reach while the account still owes a password change. */
const PASSWORD_CHANGE_EXEMPT = ['/password/change', '/logout', '/api/health'];

const withRequestId: Handle = async ({ event, resolve }) => {
	event.locals.requestId = crypto.randomUUID();

	const startedAt = performance.now();
	const response = await resolve(event);

	logger.info({
		requestId: event.locals.requestId,
		userId: event.locals.actor?.userId ?? null,
		route: event.route.id ?? event.url.pathname,
		method: event.request.method,
		status: response.status,
		durationMs: Math.round(performance.now() - startedAt)
	});

	response.headers.set('x-request-id', event.locals.requestId);
	for (const [name, value] of SECURITY_HEADERS) response.headers.set(name, value);
	// HSTS only means something over TLS; on plain http it locks nothing and confuses proxies.
	if (isProduction) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	return response;
};

const withActor: Handle = async ({ event, resolve }) => {
	event.locals.actor = null;
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE);
	const session = token ? SessionService.resolve(token) : null;
	if (token && session) {
		event.locals.user = session.user;
		event.locals.actor = SessionService.toActorContext(session.user, event.locals.requestId);
		if (session.renewedTo) setSessionCookie(event.cookies, token, session.renewedTo);
	}

	// A temporary password must be replaced before the account can reach anything else.
	if (
		session?.user.mustChangePassword &&
		event.request.method === 'GET' &&
		!PASSWORD_CHANGE_EXEMPT.some((path) => event.url.pathname.startsWith(path))
	) {
		redirect(303, '/password/change');
	}

	return resolve(event);
};

// Domain errors carry their own HTTP status. Everything else falls through to handleError as 500.
const withDomainErrors: Handle = async ({ event, resolve }) => {
	try {
		return await resolve(event);
	} catch (err) {
		if (!(err instanceof AppError)) throw err;
		logger.warn(
			{ requestId: event.locals.requestId, route: event.route.id, code: err.code },
			'request rejected'
		);
		return json(
			{ ...publicErrorBody(err), requestId: event.locals.requestId },
			{ status: httpStatusFor(err) }
		);
	}
};

export const handle: Handle = sequence(withRequestId, withActor, withDomainErrors);

export const handleError: HandleServerError = ({ error, event }) => {
	logger.error(
		{ requestId: event.locals.requestId, route: event.route.id, err: error },
		'unhandled error'
	);
	return { ...publicErrorBody(error), requestId: event.locals.requestId };
};
