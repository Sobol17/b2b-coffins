import { error, json, redirect } from '@sveltejs/kit';
import { requireOwnCall, rethrowAsHttp } from '$lib/server/core/http';
import { PushSubscriptionService } from '$lib/server/notifications/push-subscription.service';
import type { PushStateDto } from '$lib/types/push';
import { pushSubscriptionSchema, pushUnsubscribeSchema } from '$lib/validation/push';
import type { RequestHandler } from './$types';

const NO_STORE = { headers: { 'cache-control': 'private, no-store' } };

// Both contours subscribe here, so the service checks the contour right of the actor itself.
function service(locals: App.Locals, request: Request, url: URL): PushSubscriptionService {
	requireOwnCall(request, url, 'fetch');
	if (!locals.actor) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
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
	const push = service(locals, request, url);
	const body = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, { code: 'validation_failed', message: 'Неверная подписка' });
	return answer(() => push.subscribe(body.data));
};

export const DELETE: RequestHandler = async ({ locals, request, url }) => {
	const push = service(locals, request, url);
	const body = pushUnsubscribeSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, { code: 'validation_failed', message: 'Неверная подписка' });
	return answer(() => push.unsubscribe(body.data.endpoint));
};
