import { PolicyService } from '../auth/policy';
import { CharityRepository } from '../charity/charity.repository';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { OrgService } from '../settings/org.service';
import { CharityTransferRepository } from './charity-transfer.repository';
import {
	fitsRemainder,
	fundRemainderMinor,
	isTransferReversible
} from '$lib/domain/charity/balance';
import { tallyCharity } from '$lib/domain/charity/rate';
import { startOfDayInZone } from '$lib/domain/time/zone';
import type { ActorContext } from '$lib/types/actor';
import type {
	CharityTransferInput,
	CharityTransferReverseInput
} from '$lib/validation/crm-reports';

/**
 * The registry of transfers to the fund (C13, tech.md v1.51). A row is never edited: a mistake is
 * cancelled by a row of the opposite sign, and the workshop cannot send more than it has accrued.
 */
export class CharityTransferService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly transfers: CharityTransferRepository = new CharityTransferRepository(),
		private readonly accrued: CharityRepository = new CharityRepository(),
		private readonly timeZone: string = OrgService.timezone(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'charity.manage'), 'charity.manage');
	}

	/** @throws ValidationError for a date in the future, ConflictError for an amount above the rest. */
	transfer(input: CharityTransferInput): number {
		const transferredAt = this.transferredAt(input.transferredOn);
		return this.audited({ action: 'charity.transfer', entity: 'charity_transfers' }, (tx) => {
			// Read inside the write transaction: two transfers cannot both fit the same remainder.
			if (!fitsRemainder(this.remainder(tx), input.amountMinor)) {
				throw new ConflictError('Сумма больше остатка к перечислению');
			}
			const id = this.transfers.insert(
				{
					amountMinor: input.amountMinor,
					transferredAt,
					documentRef: input.documentRef,
					comment: input.comment,
					createdById: this.ctx.userId
				},
				tx
			);
			return {
				result: id,
				entityId: id,
				after: { amountMinor: input.amountMinor, transferredOn: input.transferredOn }
			};
		});
	}

	/** @throws NotFoundError for an unknown row, ConflictError for a reversal or a cancelled row. */
	reverse(input: CharityTransferReverseInput): void {
		this.audited({ action: 'charity.transfer.reverse', entity: 'charity_transfers' }, (tx) => {
			const row = this.transfers.find(input.transferId, tx);
			if (!row) throw new NotFoundError('charity_transfer');
			if (!isTransferReversible(row)) {
				throw new ConflictError('Это перечисление нельзя сторнировать');
			}
			const id = this.transfers.insert(
				{
					amountMinor: -row.amountMinor,
					transferredAt: row.transferredAt,
					documentRef: row.documentRef,
					comment: input.comment,
					createdById: this.ctx.userId,
					reversalOfId: row.id
				},
				tx
			);
			return {
				result: undefined,
				entityId: id,
				before: { amountMinor: row.amountMinor },
				after: { reversalOfId: row.id, amountMinor: -row.amountMinor }
			};
		});
	}

	private remainder(tx: Tx): number {
		const all = { kind: 'all' } as const;
		const accrued = tallyCharity(this.accrued.frozenRows(all, tx), all, this.timeZone).amountMinor;
		return fundRemainderMinor(accrued, this.transfers.amounts(tx));
	}

	/** The day of the transfer in the workshop zone; money cannot leave tomorrow. */
	private transferredAt(isoDate: string): Date {
		const at = startOfDayInZone(isoDate, this.timeZone);
		if (at === null) {
			throw new ValidationError('Выберите дату перечисления', { field: 'transferredOn' });
		}
		if (at.getTime() > this.now().getTime()) {
			throw new ValidationError('Дата перечисления не может быть позже сегодняшней', {
				field: 'transferredOn'
			});
		}
		return at;
	}
}
