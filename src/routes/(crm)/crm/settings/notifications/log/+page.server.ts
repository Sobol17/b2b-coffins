import { requireAction, requireScope } from '$lib/server/auth/guard';
import { parseListQuery } from '$lib/server/core/list';
import { NotificationDeliveryService } from '$lib/server/notifications/notification-delivery.service';
import { deliveryFiltersSchema } from '$lib/validation/push';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireScope(locals.actor, 'crm', url.pathname);
	const service = new NotificationDeliveryService(requireAction(actor, 'settings.manage'));
	// A filter value the page does not offer reads as no filter instead of an error page.
	const filters = deliveryFiltersSchema.safeParse(Object.fromEntries(url.searchParams));
	return { log: service.page(parseListQuery(url, filters.success ? filters.data : {})) };
};
