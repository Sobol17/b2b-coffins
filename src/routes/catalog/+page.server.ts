import { parseListQuery } from '$lib/server/core/list';
import { PublicCatalogService } from '$lib/server/public-catalog/public-catalog.service';
import { OrgService } from '$lib/server/settings/org.service';
import { filtersOf } from '$lib/utils/list-url';
import { publicCatalogFiltersSchema } from '$lib/validation/public-catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const catalog = new PublicCatalogService();
	const filters = publicCatalogFiltersSchema.parse(filtersOf(url, ['categoryId']));
	return {
		products: catalog.list(parseListQuery(url, filters)),
		categories: catalog.categories(),
		contacts: OrgService.publicContacts(),
		origin: url.origin
	};
};
