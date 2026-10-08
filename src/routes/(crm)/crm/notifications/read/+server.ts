import { error, json } from '@sveltejs/kit';
import { requireAction, requireScope } from '$lib/server/auth/guard';
import { requireOwnCall, rethrowAsHttp } from '$lib/server/core/http';
import { NotificationFeedService } from '$lib/server/notifications/notification-feed.service';
import { feedReadSchema } from '$lib/validation/notifications';
import type { RequestHandler } from './$types';

// The CRM layout does not run for an endpoint, so the contour is checked here.
export const POST: RequestHandler = async ({ locals, request, url }) => {
	requireOwnCall(request, url, 'fetch');
	const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'crm.access');
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
