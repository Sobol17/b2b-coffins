import { orgRequisitesSchema, orgTimezoneSchema } from '$lib/validation/settings';
import { SettingsRepository } from './settings.repository';

// Same default as `users.timezone`: the workshop and its first customers are in this zone.
const FALLBACK_TIMEZONE = 'Europe/Moscow';

export interface PublicContacts {
	readonly phone: string | null;
	readonly address: string | null;
}

/**
 * Contacts a guest may see on the landing page. INN, bank account and the rest of the requisites
 * stay on the server: the mapping below is the only thing that leaves.
 */
export class OrgService {
	static publicContacts(repo: SettingsRepository = new SettingsRepository()): PublicContacts {
		const parsed = orgRequisitesSchema.safeParse(repo.findValue('org.requisites'));
		if (!parsed.success) return { phone: null, address: null };
		return { phone: parsed.data.phone ?? null, address: parsed.data.address ?? null };
	}

	/** Timezone for rendering stored UTC timestamps (tech.md 13.1). */
	static timezone(repo: SettingsRepository = new SettingsRepository()): string {
		const parsed = orgTimezoneSchema.safeParse(repo.findValue('org.timezone'));
		return parsed.success ? parsed.data : FALLBACK_TIMEZONE;
	}
}
