import { requireAction, requireScope } from '$lib/server/auth/guard';
import { NotificationMatrixService } from '$lib/server/notifications/notification-matrix.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	return { cells: new NotificationMatrixService(requireAction(actor, 'settings.manage')).cells() };
};
