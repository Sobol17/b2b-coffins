import { json, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
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

const withRequestId: Handle = async ({ event, resolve }) => {
	event.locals.requestId = crypto.randomUUID();

	const startedAt = performance.now();
	const response = await resolve(event);

	logger.info({
		requestId: event.locals.requestId,
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

// Domain errors carry their own HTTP status. Everything else falls through to handleError as 500.
const withDomainErrors: Handle = async ({ event, resolve }) => {
	try {
		return await resolve(event);
	} catch (err) {
		if (!(err instanceof AppError)) throw err;
		logger.warn(
			{ requestId: event.locals.requestId, route: event.route.id, code: err.code, meta: err.meta },
			'request rejected'
		);
		return json(
			{ ...publicErrorBody(err), requestId: event.locals.requestId },
			{ status: httpStatusFor(err) }
		);
	}
};

export const handle: Handle = sequence(withRequestId, withDomainErrors);

export const handleError: HandleServerError = ({ error, event }) => {
	logger.error(
		{ requestId: event.locals.requestId, route: event.route.id, err: error },
		'unhandled error'
	);
	return { ...publicErrorBody(error), requestId: event.locals.requestId };
};
