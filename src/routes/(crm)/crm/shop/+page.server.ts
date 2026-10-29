import { requireAction, requireScope } from '$lib/server/auth/guard';
import { PolicyService } from '$lib/server/auth/policy';
import { orHttpStatus } from '$lib/server/core/http';
import { ShopService } from '$lib/server/crm-shop/shop.service';
import { shopSearchSchema, shopStationSchema } from '$lib/validation/crm-shop';
import { definedProps } from '$lib/utils/props';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = requireAction(requireScope(locals.actor, 'crm', url.pathname), 'shop.work');
	const search = shopSearchSchema.parse(url.searchParams.get('q') ?? undefined);
	const stations = PolicyService.stationsOf(actor);
	// A head works all four stations, so the screen shows one at a time; the crew sees its own.
	const switches = stations.length === 4;
	const chosen = shopStationSchema.parse(url.searchParams.get('station') ?? undefined);
	const station = switches ? (chosen ?? 'carpenter') : chosen;
	return {
		search: search ?? '',
		switches,
		station: station ?? null,
		stations,
		shop: orHttpStatus(() => new ShopService(actor).overview(definedProps({ search, station })))
	};
};
