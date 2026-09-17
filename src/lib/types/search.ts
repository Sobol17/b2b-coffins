// search.ts — hints of the portal header search. No price key for any role: a hint only leads to a page.
export const SITE_SEARCH_LIMITS = { categories: 5, products: 6 } as const;

export interface SiteSearchDto {
	categories: { id: number; title: string }[];
	products: { id: number; sku: string; title: string }[];
}
