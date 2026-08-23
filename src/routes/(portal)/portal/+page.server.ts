import type { PageServerLoad } from './$types';

// Placeholder home for the portal contour. P3 replaces it with the catalog storefront.
export const load: PageServerLoad = ({ locals }) => ({
	counterpartyId: locals.actor?.counterpartyId ?? null
});
