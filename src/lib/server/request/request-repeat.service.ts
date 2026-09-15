import { NotFoundError } from '../core/errors';
import { DraftCalculator } from './draft-calculator';
import { DraftItemRepository } from './draft-item.repository';
import { DraftWriter } from './draft-writer';
import { DraftRepository } from './draft.repository';
import { PortalRequestService } from './portal-request.service';
import type { ActorContext } from '$lib/types/actor';
import type { LastRequestDto } from '$lib/types/request';
import { definedProps } from '$lib/utils/props';

export interface RepeatResult {
	readonly copied: number;
	readonly skipped: number;
}

/** "Повторить заявку": a sent request of the counterparty copied back into the draft (P4). */
export class RequestRepeatService extends PortalRequestService {
	constructor(
		ctx: ActorContext,
		private readonly drafts: DraftRepository = new DraftRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly writer: DraftWriter = new DraftWriter(ctx),
		private readonly calculator: DraftCalculator = new DraftCalculator(ctx)
	) {
		super(ctx);
	}

	/** The latest sent request the actor can reach, for the portal home. */
	lastSent(): LastRequestDto | null {
		this.requireCreator();
		const row = this.drafts.lastSent(this.ctx, !this.seesWholeCounterparty());
		if (!row) return null;
		return {
			id: row.id,
			number: row.number,
			submittedAt: row.submittedAt?.toISOString() ?? null,
			itemCount: row.itemCount,
			unitCount: row.unitCount,
			...definedProps({
				totalMinor: this.ctx.canSeePrices ? this.drafts.totals(row.id)?.totalMinor : undefined
			})
		};
	}

	/**
	 * Copies the lines of a sent request into the draft. A variant or option the storefront no
	 * longer offers is skipped instead of failing the whole repeat.
	 * @throws NotFoundError for a request the actor cannot reach.
	 */
	repeat(requestId: number): RepeatResult {
		const counterpartyId = this.requireCreator();
		const source = this.drafts.findSent(this.ctx, requestId, !this.seesWholeCounterparty());
		if (!source) throw new NotFoundError('request');
		const sourceLines = this.lines.lines(source.id);
		const sourceOptions = this.lines.lineOptions(sourceLines.map((line) => line.id));

		const copied = this.audited({ action: 'request.repeat', entity: 'requests' }, (tx) => {
			const draft = this.writer.openDraft(counterpartyId, tx);
			let count = 0;
			for (const line of sourceLines) {
				const chosen = sourceOptions
					.filter((option) => option.itemId === line.id)
					.map((option) => option.optionId);
				const optionIds = this.writer.availableOptions(line.variantId, chosen);
				if (optionIds === undefined) continue;
				this.writer.putLine(
					draft.id,
					{ variantId: line.variantId, optionIds, qty: line.qty },
					true,
					tx
				);
				count += 1;
			}
			this.calculator.recalculate(draft.id, tx);
			return { result: count, entityId: draft.id, after: { sourceId: source.id, copied: count } };
		});
		return { copied, skipped: sourceLines.length - copied };
	}
}
