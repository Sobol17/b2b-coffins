import { error, json, redirect } from '@sveltejs/kit';
import { rethrowAsHttp } from '$lib/server/core/http';
import { PushSubscriptionService } from '$lib/server/notifications/push-subscription.service';
import type { PushStateDto } from '$lib/types/push';
import { pushSubscriptionSchema, pushUnsubscribeSchema } from '$lib/validation/push';
import type { RequestHandler } from './$types';

const NO_STORE = { headers: { 'cache-control': 'private, no-store' } };

// Both contours subscribe here, so the service checks the contour right of the actor itself.
function service(locals: App.Locals, request: Request, pathname: string): PushSubscriptionService {
	// A mutation over `+server.ts` carries the header of tech.md 12: a form post cannot forge it.
	if (request.headers.get('x-requested-with') !== 'fetch') {
		error(403, { code: 'forbidden', message: 'Доступ запрещён' });
	}
	if (!locals.actor) redirect(303, `/login?redirectTo=${encodeURIComponent(pathname)}`);
	return new PushSubscriptionService(locals.actor);
}

function answer(run: () => PushStateDto): Response {
	try {
		return json(run(), NO_STORE);
	} catch (err) {
		rethrowAsHttp(err);
	}
}

export const POST: RequestHandler = async ({ locals, request, url }) => {
	const push = service(locals, request, url.pathname);
	const body = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, { code: 'validation_failed', message: 'Неверная подписка' });
	return answer(() => push.subscribe(body.data));
};

export const DELETE: RequestHandler = async ({ locals, request, url }) => {
	const push = service(locals, request, url.pathname);
	const body = pushUnsubscribeSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, { code: 'validation_failed', message: 'Неверная подписка' });
	return answer(() => push.unsubscribe(body.data.endpoint));
};
