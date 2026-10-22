import {
	orgRequisitesSchema,
	orgTimezoneSchema,
	staffLimitDefaultSchema
} from '$lib/validation/settings';
import { SettingsRepository } from './settings.repository';
import type { PublicContacts } from '$lib/types/landing';

// Same default as `users.timezone`: the workshop and its first customers are in this zone.
const FALLBACK_TIMEZONE = 'Europe/Moscow';
// Same as the column default of `counterparties.staff_limit`: what a counterparty got before C1.
const FALLBACK_STAFF_LIMIT = 10;

const NO_CONTACTS: PublicContacts = { phone: null, address: null, operator: null };

/**
 * Contacts and the operator a guest may see on the landing page, in the footer and in the legal
 * documents. The bank account, BIK and KPP stay on the server: the mapping below is the only thing
 * that leaves.
 */
export class OrgService {
	static publicContacts(repo: SettingsRepository = new SettingsRepository()): PublicContacts {
		const parsed = orgRequisitesSchema.safeParse(repo.findValue('org.requisites'));
		if (!parsed.success) return NO_CONTACTS;
		const { name, inn, ogrn, email, phone, address } = parsed.data;
		return {
			phone: phone ?? null,
			address: address ?? null,
			operator: { name, inn: inn ?? null, ogrn: ogrn ?? null, email: email ?? null }
		};
	}

	/** Timezone for rendering stored UTC timestamps (tech.md 13.1). */
	static timezone(repo: SettingsRepository = new SettingsRepository()): string {
		const parsed = orgTimezoneSchema.safeParse(repo.findValue('org.timezone'));
		return parsed.success ? parsed.data : FALLBACK_TIMEZONE;
	}

	/** Seats of a new counterparty, `counterparty.staff_limit_default` (tech.md 5.9). */
	static staffLimitDefault(repo: SettingsRepository = new SettingsRepository()): number {
		const parsed = staffLimitDefaultSchema.safeParse(
			repo.findValue('counterparty.staff_limit_default')
		);
		return parsed.success ? parsed.data : FALLBACK_STAFF_LIMIT;
	}
}
