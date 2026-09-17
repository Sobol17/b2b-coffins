import { PolicyService } from '../auth/policy';
import { CatalogService } from '../catalog/catalog.service';
import { BaseService } from '../core/service';
import type { ActorContext } from '$lib/types/actor';
import { SITE_SEARCH_LIMITS, type SiteSearchDto } from '$lib/types/search';

/**
 * Hints for the portal header search. Page sections are matched in the browser from the menu the
 * role already has; the server only answers what needs the catalog.
 */
export class SiteSearchService extends BaseService {
	constructor(ctx: ActorContext) {
		super(ctx);
	}

	/** @throws ForbiddenError without `catalog.read`. */
	find(query: string): SiteSearchDto {
		this.assert(PolicyService.can(this.ctx, 'catalog.read'), 'catalog.read');
		const catalog = new CatalogService(this.ctx);
		const needle = query.toLowerCase();

		const categories = catalog
			.categories()
			.filter((category) => category.title.toLowerCase().includes(needle))
			.slice(0, SITE_SEARCH_LIMITS.categories)
			.map(({ id, title }) => ({ id, title }));

		// Picked key by key: a hint must not carry the price the list row has for this role.
		const products = catalog
			.list({ page: 1, perPage: SITE_SEARCH_LIMITS.products, search: query })
			.rows.map(({ id, sku, title }) => ({ id, sku, title }));

		return { categories, products };
	}
}
