import type { Tx } from '../db/client';
import { Queue } from '../queue/queue';
import { jobKey } from '../queue/topics';
import { OrgService } from '../settings/org.service';
import { CharityRepository } from './charity.repository';
import { CharitySettings } from './charity-settings';
import { freezeCharity, scopesForDelivery } from '$lib/domain/charity/rate';

/**
 * The `freezeCharity` effect of `ready -> delivered` (tech.md 6.2). It runs inside the delivery
 * transaction, so the amount, the recount jobs and the status commit or roll back together.
 */
export class CharityFreezer {
	constructor(
		private readonly repo: CharityRepository = new CharityRepository(),
		private readonly settings: CharitySettings = new CharitySettings()
	) {}

	freeze(requestId: number, tx: Tx): void {
		const subject = this.repo.freezeSubject(requestId, tx);
		if (!subject?.deliveredAt || subject.isStockRequest || subject.charityAmountMinor !== null) {
			return;
		}
		// Freeze the rate here: changing settings later must not move the public counter.
		const values = freezeCharity(subject, this.settings.rateBp(tx));
		if (!values || !this.repo.freeze(requestId, values, tx)) return;

		const scopes = scopesForDelivery(
			subject.deliveredAt,
			subject.counterpartyId,
			OrgService.timezone()
		);
		for (const scope of scopes) {
			Queue.enqueue('charity.recount', { scope }, jobKey.charityRecount(scope, requestId), tx);
		}
	}
}
