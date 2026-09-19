import { error, json } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { rethrowAsHttp } from '$lib/server/core/http';
import { NotificationFeedService } from '$lib/server/notifications/notification-feed.service';
import { feedReadSchema } from '$lib/validation/notifications';
import type { RequestHandler } from './$types';

// The portal layout does not run for an endpoint, so the contour is checked here.
export const POST: RequestHandler = async ({ locals, request, url }) => {
	// A mutation over `+server.ts` carries the header of tech.md 12: a form post cannot forge it.
	if (request.headers.get('x-requested-with') !== 'fetch') {
		error(403, { code: 'forbidden', message: 'Доступ запрещён' });
	}
	const actor = requireAction(requireScope(locals.actor, 'portal', url.pathname), 'portal.access');
	const body = feedReadSchema.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, { code: 'validation_failed', message: 'Неизвестные уведомления' });

	let unread: number;
	try {
		unread = new NotificationFeedService(actor).markRead(body.data.ids);
	} catch (err) {
		rethrowAsHttp(err);
	}
	return json({ unread }, { headers: { 'cache-control': 'private, no-store' } });
};
