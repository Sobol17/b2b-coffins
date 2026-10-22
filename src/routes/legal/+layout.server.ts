import { OrgService } from '$lib/server/settings/org.service';
import type { LayoutServerLoad } from './$types';

// Public documents: a guest reads them before signing in, so there is no actor check here.
export const load: LayoutServerLoad = ({ url }) => ({
	contacts: OrgService.publicContacts(),
	site: url.host
});
