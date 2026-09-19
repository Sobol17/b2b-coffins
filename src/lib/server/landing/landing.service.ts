import { CharitySettings } from '../charity/charity-settings';
import { config } from '../config';
import { MediaRepository } from '../files/media.repository';
import { readStoredFile, type FileContent } from '../files/storage';
import { LandingRepository } from './landing.repository';
import {
	LANDING_WORKS_LIMIT,
	type LandingCharityDto,
	type LandingWorkDto
} from '$lib/types/landing';

const FULL_RATE_BP = 10_000;

/**
 * The public face of the workshop (P13). It runs without an actor, so every method states what a
 * guest may see: covers and titles of published models, the fund and its rate. No figures of the
 * fund, no catalog counters, nothing about a counterparty.
 */
export class LandingService {
	constructor(
		private readonly root: string = config.FILES_DIR,
		private readonly works_: LandingRepository = new LandingRepository(),
		private readonly mediaRows: MediaRepository = new MediaRepository(),
		private readonly charitySettings: CharitySettings = new CharitySettings()
	) {}

	/** Up to `limit` examples of the work: a cover and the title of the model on it. */
	works(limit: number = LANDING_WORKS_LIMIT): LandingWorkDto[] {
		return this.works_.works(limit).map((row) => ({
			coverMediaId: row.coverMediaId,
			title: row.title
		}));
	}

	/**
	 * The cover of a published model for `GET /api/public/works/[id]`.
	 * @returns null for a photo of a hidden or deleted model, for any other file and for a missing
	 * one: a guest hears «not found» about all of them alike.
	 */
	async cover(mediaId: number): Promise<FileContent | null> {
		const row = this.mediaRows.findById(mediaId);
		if (!row || row.ownerScope !== 'product' || row.ownerId === null) return null;
		if (!this.works_.isPublished(row.ownerId)) return null;
		const bytes = await readStoredFile(row.path, this.root);
		return bytes === null ? null : { mime: row.mime, bytes };
	}

	/** @returns null while the workshop has named no fund or no valid rate. */
	charity(): LandingCharityDto | null {
		const fund = this.charitySettings.fund();
		const rateBp = this.charitySettings.findRateBp();
		if (!fund || rateBp === null) return null;
		return {
			fundTitle: fund.title,
			fundUrl: fund.url ?? null,
			// Basis points are the storage unit; the landing speaks percent, as the contract does.
			ratePercent: (rateBp * 100) / FULL_RATE_BP
		};
	}
}
