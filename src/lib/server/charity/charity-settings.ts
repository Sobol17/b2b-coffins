import { SettingsRepository } from '../settings/settings.repository';
import type { Tx } from '../db/client';
import { charityFundSchema, charityRateSchema, type CharityFund } from '$lib/validation/settings';

/** Charity keys of `settings`, parsed on read like every other JSON setting. */
export class CharitySettings {
	constructor(private readonly repo: SettingsRepository = new SettingsRepository()) {}

	/**
	 * The rate a delivery freezes. A missing or broken rate stops the delivery instead of freezing
	 * a wrong amount forever: a frozen amount is never recalculated (tech.md 6.2, invariant 3).
	 * @throws Error when `charity.rate_bp` is not a valid rate.
	 */
	rateBp(tx?: Tx): number {
		const parsed = charityRateSchema.safeParse(this.repo.findValue('charity.rate_bp', tx));
		if (!parsed.success) throw new Error('settings charity.rate_bp is missing or invalid');
		return parsed.data;
	}

	/** The fund the banner names, or null when the workshop has not set one yet. */
	fund(): CharityFund | null {
		const parsed = charityFundSchema.safeParse(this.repo.findValue('charity.fund'));
		return parsed.success ? parsed.data : null;
	}
}
