import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { DraftItemRepository, type DraftLineRow } from '../request/draft-item.repository';
import { DraftWriter } from '../request/draft-writer';
import { RequestPricer } from '../request/request-pricer';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestRepository, type SteeredRow } from './crm-request.repository';
import { itemsEditMode } from '$lib/domain/request/amendment';
import type { ActorContext } from '$lib/types/actor';
import type { AddLineInput, LineQtyInput, RemoveLineInput } from '$lib/validation/crm-request';

interface Change {
	readonly comment: string | null;
	/** Mutates the lines and says in words what it did, for the history line. */
	readonly apply: (request: SteeredRow, tx: Tx) => string;
}

/**
 * Lines of a sent request (C4, tech.md v1.40). In `new` the request is repriced as a whole; in
 * `in_work` the prices stay frozen and every change needs a reason that lands in the history.
 */
export class CrmRequestItemsService extends CrmRequestBaseService {
	constructor(
		ctx: ActorContext,
		requests: CrmRequestRepository = new CrmRequestRepository(),
		private readonly lines: DraftItemRepository = new DraftItemRepository(),
		private readonly writer: DraftWriter = new DraftWriter(ctx),
		private readonly pricer: RequestPricer = new RequestPricer()
	) {
		super(ctx, requests);
	}

	/** @throws NotFoundError for a position not offered, ValidationError for a colour or a reason. */
	addLine(requestId: number, input: AddLineInput): void {
		this.change(requestId, {
			comment: input.comment,
			apply: (request, tx) => {
				const optionIds = this.writer.checkedOptions(
					input.variantId,
					input.optionId === null ? [] : [input.optionId]
				);
				this.writer.putLine(
					request.id,
					{ variantId: input.variantId, optionIds, qty: input.qty },
					false,
					tx
				);
				const added = this.lines
					.lines(request.id, tx)
					.find((line) => line.variantId === input.variantId);
				return `Добавлено: ${added?.sku ?? input.variantId} × ${input.qty}`;
			}
		});
	}

	/** @throws NotFoundError for a line of another request. */
	setQty(requestId: number, input: LineQtyInput): void {
		this.change(requestId, {
			comment: input.comment,
			apply: (request, tx) => {
				const line = this.line(request.id, input.itemId, tx);
				this.lines.setQty(line.id, input.qty, tx);
				return `Количество ${line.sku}: ${line.qty} → ${input.qty}`;
			}
		});
	}

	/** @throws ConflictError for the last line, NotFoundError for a line of another request. */
	removeLine(requestId: number, input: RemoveLineInput): void {
		this.change(requestId, {
			comment: input.comment,
			apply: (request, tx) => {
				const line = this.line(request.id, input.itemId, tx);
				if (this.lines.lines(request.id, tx).length <= 1) {
					throw new ConflictError('В заявке должна остаться хотя бы одна позиция');
				}
				this.lines.deleteLine(line.id, tx);
				return `Удалено: ${line.sku} × ${line.qty}`;
			}
		});
	}

	private change(requestId: number, change: Change): void {
		this.requireSteering();
		this.audited({ action: 'request.items_update', entity: 'requests' }, (tx) => {
			const request = this.requireRequest(requestId, tx);
			const mode = itemsEditMode(request.status);
			if (mode === 'closed') {
				throw new ConflictError('Состав меняется, пока заявка не готова');
			}
			if (mode === 'controlled' && change.comment === null) {
				throw new ValidationError('Укажите причину изменения', { field: 'comment' });
			}
			const before = this.snapshot(request.id, tx);
			const summary = change.apply(request, tx);
			if (mode === 'free') {
				this.pricer.reprice(request.id, request.counterpartyId, tx);
			} else {
				this.pricer.repriceFrozen(request.id, request.counterpartyId, request, tx);
				const note = `${summary}. ${change.comment ?? ''}`.trim();
				this.requests.insertNote(request.id, request.status, this.ctx.userId, note, tx);
			}
			return {
				result: undefined,
				entityId: request.id,
				before: { lines: before },
				after: { lines: this.snapshot(request.id, tx), mode }
			};
		});
	}

	private line(requestId: number, itemId: number, tx: Tx): DraftLineRow {
		const line = this.lines.findLine(requestId, itemId, tx);
		if (!line) throw new NotFoundError('request item');
		return line;
	}

	private snapshot(requestId: number, tx: Tx): { sku: string; qty: number }[] {
		return this.lines.lines(requestId, tx).map((line) => ({ sku: line.sku, qty: line.qty }));
	}
}
